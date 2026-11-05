import { ipcMain, dialog, BrowserWindow } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { IpcChannel } from "@shared/ipc-channels";
import type { OpenProjectResult, SaveProjectResult } from "@shared/types/api";

/* ============================================================
   PROJECT IPC
   ------------------------------------------------------------
   Handler `project:open` dan `project:save`. Main tetap "dumb":
   hanya file I/O. Validasi schema ada di renderer (F13).

   Format file: `.cutflow.json` (JSON pretty-print dari Project).
   ============================================================ */

export function registerProjectIpc(): void {
  ipcMain.handle(IpcChannel.PROJECT_OPEN, handleOpen);
  ipcMain.handle(IpcChannel.PROJECT_SAVE, handleSave);
}

async function handleOpen(): Promise<OpenProjectResult> {
  const win =
    BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  if (!win) return { ok: false, error: "no window" };

  const result = await dialog.showOpenDialog(win, {
    title: "Open CutFlow Project",
    properties: ["openFile"],
    filters: [
      { name: "CutFlow Project", extensions: ["cutflow.json", "json"] },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { ok: false, error: "canceled" };
  }

  const filePath = result.filePaths[0];
  if (!filePath) return { ok: false, error: "canceled" };

  try {
    const data = await readFile(filePath, "utf-8");
    return { ok: true, path: filePath, data };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "read failed",
    };
  }
}

async function handleSave(
  _ev: Electron.IpcMainInvokeEvent,
  projectJson: unknown,
): Promise<SaveProjectResult> {
  if (typeof projectJson !== "string") {
    return { ok: false, error: "invalid payload" };
  }

  const win =
    BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  if (!win) return { ok: false, error: "no window" };

  const defaultName = extractDefaultFileName(projectJson);
  const result = await dialog.showSaveDialog(win, {
    title: "Save CutFlow Project",
    defaultPath: `${defaultName}.cutflow.json`,
    filters: [{ name: "CutFlow Project", extensions: ["cutflow.json"] }],
  });

  if (result.canceled || !result.filePath) {
    return { ok: false, error: "canceled" };
  }

  try {
    await writeFile(result.filePath, projectJson, "utf-8");
    return { ok: true, path: result.filePath };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "write failed",
    };
  }
}

function extractDefaultFileName(json: string): string {
  try {
    const parsed = JSON.parse(json) as { name?: unknown };
    if (typeof parsed.name === "string" && parsed.name.trim()) {
      return sanitizeFileName(parsed.name.trim());
    }
  } catch {
    /* fallthrough */
  }
  return "untitled";
}

function sanitizeFileName(name: string): string {
  // Windows illegal: < > : " / \ | ? *
  // Cross-platform safe: alphanumeric + space + - + _
  return name.replace(/[^a-zA-Z0-9 _-]/g, "_").slice(0, 80) || "untitled";
}
