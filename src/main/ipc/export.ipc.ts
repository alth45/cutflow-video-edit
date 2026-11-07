import { ipcMain, dialog, BrowserWindow } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { IpcChannel } from "@shared/ipc-channels";
import type { VideoExportParams } from "@shared/types/api";

/* ============================================================
   EXPORT IPC — FFmpeg pipeline
   ------------------------------------------------------------
   Flow:
   1. begin     → save dialog, capture params + create temp dir
   2. setAudio  → write WAV ke temp/audio.wav
   3. startVideo→ spawn ffmpeg (stdin=rawvideo, +audio.wav input)
   4. writeFrame→ write RGBA bytes ke ffmpeg.stdin
   5. finish    → close stdin, wait exit, cleanup temp
   6. cancel    → kill ffmpeg, cleanup temp
   ============================================================ */

interface ExportSession {
  params: VideoExportParams;
  outputPath: string;
  tempDir: string;
  audioPath: string | null;
  ffmpeg: ChildProcess | null;
  finished: boolean;
}

let session: ExportSession | null = null;

export function registerExportIpc(): void {
  ipcMain.handle(IpcChannel.EXPORT_BEGIN, handleBegin);
  ipcMain.handle(IpcChannel.EXPORT_SET_AUDIO, handleSetAudio);
  ipcMain.handle(IpcChannel.EXPORT_START_VIDEO, handleStartVideo);
  ipcMain.handle(IpcChannel.EXPORT_WRITE_FRAME, handleWriteFrame);
  ipcMain.handle(IpcChannel.EXPORT_FINISH, handleFinish);
  ipcMain.handle(IpcChannel.EXPORT_CANCEL, handleCancel);
}

async function handleBegin(
  _ev: Electron.IpcMainInvokeEvent,
  params: VideoExportParams,
): Promise<{ ok: boolean; path?: string }> {
  if (session) await cleanupSession();

  const win =
    BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  if (!win) return { ok: false };

  const result = await dialog.showSaveDialog(win, {
    title: "Export Video (MP4)",
    defaultPath: "cutflow-export.mp4",
    filters: [{ name: "MP4 Video", extensions: ["mp4"] }],
  });

  if (result.canceled || !result.filePath) return { ok: false };

  const tempDir = await mkdtemp(join(tmpdir(), "cutflow-export-"));

  session = {
    params,
    outputPath: result.filePath,
    tempDir,
    audioPath: null,
    ffmpeg: null,
    finished: false,
  };

  return { ok: true, path: result.filePath };
}

async function handleSetAudio(
  _ev: Electron.IpcMainInvokeEvent,
  wav: ArrayBuffer,
): Promise<{ ok: boolean }> {
  if (!session) return { ok: false };
  const audioPath = join(session.tempDir, "audio.wav");
  await writeFile(audioPath, Buffer.from(wav));
  session.audioPath = audioPath;
  return { ok: true };
}

async function handleStartVideo(): Promise<{ ok: boolean; error?: string }> {
  if (!session) return { ok: false, error: "No session" };
  if (!ffmpegPath) return { ok: false, error: "FFmpeg binary not found" };

  const { width, height, fps } = session.params;

  const args: string[] = [
    "-y",
    // Video input (raw RGBA from stdin)
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgba",
    "-s",
    `${width}x${height}`,
    "-r",
    String(fps),
    "-i",
    "pipe:0",
  ];

  // Audio input (if available)
  if (session.audioPath) {
    args.push("-i", session.audioPath);
  }

  // Video codec
  args.push(
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "22",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
  );

  // Audio codec
  if (session.audioPath) {
    args.push("-c:a", "aac", "-b:a", "192k");
  }

  args.push("-shortest", session.outputPath);

  try {
    const proc = spawn(ffmpegPath, args, { stdio: ["pipe", "ignore", "pipe"] });
    session.ffmpeg = proc;

    proc.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      // FFmpeg logs everything to stderr; only log warnings/errors
      if (text.includes("error") || text.includes("Error")) {
        // eslint-disable-next-line no-console
        console.warn("[ffmpeg]", text.trim());
      }
    });

    proc.on("error", (err) => {
      // eslint-disable-next-line no-console
      console.error("[ffmpeg] spawn error:", err);
    });

    // Wait for spawn to be ready before returning
    await new Promise<void>((resolve, reject) => {
      proc.once("spawn", () => resolve());
      proc.once("error", (err) => reject(err));
    });

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function handleWriteFrame(
  _ev: Electron.IpcMainInvokeEvent,
  rgba: ArrayBuffer,
): Promise<{ ok: boolean }> {
  if (!session?.ffmpeg?.stdin) return { ok: false };

  const buf = Buffer.from(rgba);

  return new Promise((resolve) => {
    const stdin = session!.ffmpeg!.stdin!;
    const ok = stdin.write(buf, (err) => {
      if (err) {
        // eslint-disable-next-line no-console
        console.error("[ffmpeg] stdin write error:", err);
        resolve({ ok: false });
      }
    });
    if (ok) {
      // Buffered — resolve immediately (fast path)
      resolve({ ok: true });
    } else {
      // Backpressure — wait for drain
      stdin.once("drain", () => resolve({ ok: true }));
    }
  });
}

async function handleFinish(): Promise<{ ok: boolean; error?: string }> {
  if (!session?.ffmpeg) {
    return { ok: false, error: "No active export" };
  }

  const proc = session.ffmpeg;

  return new Promise((resolve) => {
    proc.once("exit", async (code, signal) => {
      const success = code === 0;
      await cleanupSession();

      if (success) {
        resolve({ ok: true });
      } else {
        resolve({
          ok: false,
          error: `FFmpeg exited with code ${code ?? signal ?? "unknown"}`,
        });
      }
    });

    proc.stdin?.end();
  });
}

async function handleCancel(): Promise<void> {
  if (session?.ffmpeg) {
    session.ffmpeg.kill("SIGKILL");
  }
  await cleanupSession();
}

async function cleanupSession(): Promise<void> {
  if (!session) return;
  const { tempDir } = session;
  session = null;
  try {
    await rm(tempDir, { recursive: true, force: true });
  } catch {
    // Best effort
  }
}
