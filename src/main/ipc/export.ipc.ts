import { ipcMain, dialog, BrowserWindow } from "electron";
import { createWriteStream, type WriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { IpcChannel } from "@shared/ipc-channels";

let currentStream: WriteStream | null = null;
let currentPath: string | null = null;

export function registerExportIpc(): void {
  ipcMain.handle(IpcChannel.EXPORT_BEGIN, async () => {
    const win =
      BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    if (!win) return { ok: false };

    const result = await dialog.showSaveDialog(win, {
      title: "Export Video",
      defaultPath: "cutflow-export.webm",
      filters: [{ name: "WebM Video", extensions: ["webm"] }],
    });

    if (result.canceled || !result.filePath) {
      return { ok: false };
    }

    currentPath = result.filePath;
    currentStream = createWriteStream(currentPath);

    return { ok: true, path: currentPath };
  });

  ipcMain.on(IpcChannel.EXPORT_CHUNK, (_ev, data: Uint8Array) => {
    if (currentStream) {
      currentStream.write(Buffer.from(data));
    }
  });

  ipcMain.handle(IpcChannel.EXPORT_FINISH, async () => {
    if (!currentStream) return { ok: false, error: "No active stream" };
    return new Promise((resolve) => {
      currentStream!.end(() => {
        currentStream = null;
        currentPath = null;
        resolve({ ok: true });
      });
    });
  });

  ipcMain.handle(IpcChannel.EXPORT_CANCEL, async () => {
    if (currentStream) {
      currentStream.end();
      currentStream = null;
      if (currentPath) {
        await unlink(currentPath).catch(() => {});
        currentPath = null;
      }
    }
  });
}
