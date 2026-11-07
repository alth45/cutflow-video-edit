import { registerProjectIpc } from "./project.ipc";
import { registerMediaIpc } from "./media.ipc";
import { registerExportIpc } from "./export.ipc";
/* ============================================================
   IPC REGISTRATION
   ------------------------------------------------------------
   Titik registrasi semua handler. Dipanggil sekali dari
   `main/index.ts` di `app.whenReady()`.
   ============================================================ */

export function registerIpcHandlers(): void {
  registerProjectIpc();
  registerMediaIpc();
  registerExportIpc();
  // eslint-disable-next-line no-console
  console.info("[cutflow:main] IPC handlers registered");
}
