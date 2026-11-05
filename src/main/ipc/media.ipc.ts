import { ipcMain, dialog, BrowserWindow } from "electron";
import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { IpcChannel } from "@shared/ipc-channels";
import type { PickFilesResult, MediaFileInfo } from "@shared/types/api";

/* ============================================================
   MEDIA IPC
   ------------------------------------------------------------
   Handler `media:pick-files`. Dialog multi-select, stat each
   file (size), return metadata. Tidak extract durasi —
   butuh ffprobe (fase lanjut).
   ============================================================ */

const MEDIA_EXTENSIONS = [
  "mp4",
  "mov",
  "mkv",
  "webm",
  "avi",
  "m4v",
  "mp3",
  "wav",
  "ogg",
  "flac",
  "aac",
  "m4a",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "bmp",
];

export function registerMediaIpc(): void {
  ipcMain.handle(IpcChannel.MEDIA_PICK_FILES, handlePickFiles);
}

async function handlePickFiles(): Promise<PickFilesResult> {
  const win =
    BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  if (!win) return { ok: false, files: [], error: "no window" };

  const result = await dialog.showOpenDialog(win, {
    title: "Import Media",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Media Files", extensions: MEDIA_EXTENSIONS }],
  });

  if (result.canceled) {
    return { ok: true, files: [] };
  }

  const files: MediaFileInfo[] = [];
  for (const filePath of result.filePaths) {
    try {
      const s = await stat(filePath);
      if (!s.isFile()) continue;
      files.push({
        path: filePath,
        name: basename(filePath),
        size: s.size,
      });
    } catch {
      // Skip file yang tidak accessible (permission, race, dsb.).
    }
  }

  return { ok: true, files };
}
