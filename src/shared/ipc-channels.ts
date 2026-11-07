/* ============================================================
   IPC CHANNELS
   ------------------------------------------------------------
   Nama channel yang dipakai untuk komunikasi preload ↔ main.

   Kenapa BUKAN `enum`:
   - `const enum` di-inline oleh TypeScript saat transpile →
     nilai tidak tersedia di runtime, tapi Electron IPC butuh
     string literal di runtime (channel name harus ada).
   - `regular enum` menghasilkan objek runtime + `namespace`
     polyfill → bundle lebih besar, dan `verbatimModuleSyntax`
     komplain saat import sebagai type.

   Solusi: `Object.freeze` + `as const` → ringan, type-safe,
   dan nilainya tetap string literal yang valid di runtime.

   ATURAN:
   - Setiap channel WAJIB punya handler di `main/ipc/*` (F13).
   - Setiap perubahan di sini WAJIB diikuti update handler.
   - Channel yang typo akan jadi COMPILE ERROR di dua sisi
     (preload call + main handler register).
   ============================================================ */

/**
 * Channel names untuk `ipcRenderer.invoke` / `ipcMain.handle`.
 *
 * Konvensi penamaan: `<domain>:<action>` — lowercase, kebab-case.
 * Contoh: `project:open`, `media:pick-files`.
 *
 * Prefix domain memudahkan grouping saat log/diagnosa.
 */
export const IpcChannel = Object.freeze({
  /* ===== PROJECT ===== */
  /** Buka file project dari disk (trigger dialog open di main). */
  PROJECT_OPEN: "project:open",
  /** Simpan project ke file (trigger dialog save di main). */
  PROJECT_SAVE: "project:save",

  /* ===== MEDIA ===== */
  /** Buka file picker untuk memilih media file. */
  MEDIA_PICK_FILES: "media:pick-files",

  /* ===== EXPORT ===== */
  EXPORT_BEGIN: "export:begin",
  EXPORT_CHUNK: "export:chunk",
  EXPORT_FINISH: "export:finish",
  EXPORT_CANCEL: "export:cancel",
} as const);

/* ============================================================
   DERIVED TYPES
   ------------------------------------------------------------
   Memberi tipe union string untuk semua nilai channel.
   Berguna untuk:
   - Type-safe logger: `logInvoke(channel: IpcChannelValue, ...)`
   - Test helper: `mockHandler(channel: IpcChannelValue, ...)`
   - Compile-time validation di utility IPC.
   ============================================================ */

/** Union dari semua nilai channel, mis. `'project:open' | 'project:save' | ...` */
export type IpcChannelValue = (typeof IpcChannel)[keyof typeof IpcChannel];

/** Union dari semua KEY channel, mis. `'PROJECT_OPEN' | 'PROJECT_SAVE' | ...` */
export type IpcChannelKey = keyof typeof IpcChannel;
