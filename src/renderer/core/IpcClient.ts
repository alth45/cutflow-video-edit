import type { CutFlowApi } from "@shared/types/api";

/* ============================================================
   IPC CLIENT
   ------------------------------------------------------------
   Titik akses tunggal untuk renderer berkomunikasi ke main
   process via `window.cutflow` (yang di-expose preload).

   Kenapa wrapper ini ada padahal `window.cutflow` sudah typed:

   1. FAIL-FAST GUARD
      Kalau preload gagal load, `window.cutflow` jadi `undefined`.
      Tanpa guard, error akan muncul sebagai
      "Cannot read property 'project' of undefined" di tempat
      acak — susah ditrace. Helper ini mengubahnya jadi error
      jelas dengan prefix `[IpcClient]`.

   2. UNIFORM RESULT HANDLING
      Setiap method IPC mengembalikan `{ ok: boolean, ... }`.
      Helper `invokeOk()` menangani:
        - cek `res.ok`
        - log error konsisten
        - panggil callback error (mis. toast)
        - return `null` sebagai pengganti "gagal"
      Pemanggil cukup `if (!res) return;` — boilerplate
      try/catch + ok-check hilang dari setiap call site.

   3. DEFENSE-IN-DEPTH
      Preload `invokeSafe` sudah menangkap rejection, tapi
      kalau terjadi edge case (bug di preload, race condition
      saat window closing), `invoke` bisa throw. Helper ini
      juga handle — caller tidak perlu peduli.

   ATURAN:
   - JANGAN akses `window.cutflow` langsung dari modul lain.
     Selalu lewat `getIpc()`.
   - JANGAN import `ipcRenderer` di renderer — itu wilayah preload.
   ============================================================ */

/* ============================================================
   TYPES
   ------------------------------------------------------------
   `OkResult` = bentuk minimal dari semua result types di
   `shared/types/api.ts` (OpenProjectResult, SaveProjectResult,
   PickFilesResult). Cukup `ok` + opsional `error` untuk helper
   generik bekerja.
   ============================================================ */
export interface OkResult {
  readonly ok: boolean;
  readonly error?: string;
}

/* ============================================================
   ACCESSOR
   ------------------------------------------------------------
   Guard + typed access. Return `window.cutflow` yang sudah
   frozen (lihat preload/api.ts). Tidak ada mutasi.
   ============================================================ */
export function getIpc(): CutFlowApi {
  if (!window.cutflow) {
    throw new Error(
      "[IpcClient] window.cutflow tidak tersedia. " +
        "Kemungkinan preload gagal load atau contextBridge belum " +
        "di-expose. Cek console preload untuk detail.",
    );
  }
  return window.cutflow;
}

/* ============================================================
   RESULT HELPER
   ------------------------------------------------------------
   Bungkus `ipc.invoke` dengan error handling uniform.

   `onError` callback opsional — pemanggil bisa tentukan
   bagaimana error ditampilkan (mis. toast, inline message,
   atau silent di operasi background).
   ============================================================ */
export async function invokeOk<R extends OkResult>(
  promise: Promise<R>,
  onError?: (message: string) => void,
  silentErrors: readonly string[] = [],
): Promise<R | null> {
  try {
    const res = await promise;

    if (!res.ok) {
      const message = res.error ?? "unknown error";
      const silent = silentErrors.includes(message);
      if (!silent) {
        // eslint-disable-next-line no-console
        console.error("[IpcClient] invoke failed:", message);
        onError?.(message);
      }
      return null;
    }

    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error("[IpcClient] invoke threw:", err);
    onError?.(message);
    return null;
  }
}

/* ============================================================
   CATATAN TEKNIS — Future improvement
   ------------------------------------------------------------
   Saat ini `shared/types/api.ts` mendefinisikan result types
   sebagai `{ ok: boolean; data?: T; error?: string }` — field
   `data` dan `error` optional. Artinya walaupun kita sudah cek
   `res.ok === true`, TypeScript MASIH menganggap `res.data`
   bisa `undefined`.

   Pemanggil tetap harus:
     if (!res.ok) return;
     const data = res.data!;   // ← non-null assertion

   Kalau kita ubah ke discriminated union:
     type OpenProjectResult =
       | { ok: true; path: string; data: string }
       | { ok: false; error: string };

   Maka `if (res.ok)` otomatis narrow → `res.data` guaranteed
   `string`, tanpa `!`.

   TODO(F13): perubahan ini akan dibuat saat handler main
   diimplementasi (lebih mudah memvalidasi sekali). Untuk
   sekarang, tambahkan `!` hanya di call site yang sudah pasti
   `ok === true`.
   ============================================================ */

/* ============================================================
   USAGE PATTERN (dokumentasi)
   ------------------------------------------------------------
   Di modul (F9 untuk preview, F13 untuk project save):

     import { getIpc, invokeOk } from '@core/IpcClient';

     // 1. Buka project
     const res = await invokeOk(
       getIpc().project.open(),
       (msg) => toast({ tone: 'error', message: msg }),
     );
     if (!res) return;          // gagal — toast sudah tampil
     const projectJson = res.data!;
     parseProject(projectJson);

     // 2. Import media
     const picked = await invokeOk(getIpc().media.pickFiles());
     if (!picked) return;       // error ter-log, tidak ada toast
     for (const file of picked.files) addMedia(file);
   ============================================================ */
