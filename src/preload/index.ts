import { contextBridge } from "electron";
import { cutflowApi } from "./api";

/* ============================================================
   PRELOAD ENTRY
   ------------------------------------------------------------
   Tugas file ini SANGAT sempit:
   1. Expose `cutflowApi` ke `window.cutflow` di renderer.
   2. Guard: hanya sekali jalan per window.
   3. Log startup (dev only).

   File ini TIDAK berisi implementasi API — itu di ./api.ts.
   File ini TIDAK berisi validasi data — itu di kontrak tipe.
   File ini = "kabel satu arah" preload → renderer.
   ============================================================ */

/** Key global yang di-expose ke renderer. */
const EXPOSE_KEY = "cutflow" as const;

/** Guard module-scope: cegah double-expose jika script di-reload. */
let exposed = false;

/**
 * Entry preload. Dipanggil sekali per BrowserWindow oleh Electron,
 * setelah DOM renderer dibuat dan sebelum script renderer berjalan.
 */
function bootstrapPreload(): void {
  if (exposed) {
    // eslint-disable-next-line no-console
    console.warn(
      "[cutflow:preload] bootstrap dipanggil lebih dari sekali — dilewati.",
    );
    return;
  }

  try {
    contextBridge.exposeInMainWorld(EXPOSE_KEY, cutflowApi);
    exposed = true;

    if (!cutflowApi.app.isPackaged) {
      // eslint-disable-next-line no-console
      console.info(
        `[cutflow:preload] ready · v${cutflowApi.app.version} · electron ${cutflowApi.app.electron}`,
      );
    }
  } catch (err) {
    // Kalau contextBridge gagal (mis. dipanggil di konteks non-preload),
    // JANGAN lempar — biar renderer tetap jalan tanpa API, lebih baik
    // daripada window putih total. Error tetap ter-log untuk diagnosa.
    // eslint-disable-next-line no-console
    console.error("[cutflow:preload] gagal expose contextBridge:", err);
  }
}

bootstrapPreload();
