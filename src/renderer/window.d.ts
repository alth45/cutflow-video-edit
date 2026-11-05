import type { CutFlowApi } from "@shared/types/api";

/* ============================================================
   GLOBAL AUGMENTATION: Window
   ------------------------------------------------------------
   Memberi tahu TypeScript bahwa `window.cutflow` ADA di runtime
   (di-inject oleh preload via contextBridge).

   File ini TIDAK menghasilkan JavaScript — hanya deklarasi tipe.
   Tujuannya: renderer bisa `window.cutflow.project.open()`
   dengan type-safe penuh, tanpa `any` dan tanpa cast.
   ============================================================ */

declare global {
  interface Window {
    /**
     * CutFlow API yang di-expose oleh preload.
     *
     * `readonly` di level property: renderer tidak boleh
     * mengganti seluruh objek API. Method individual di dalam
     * `CutFlowApi` juga `readonly` — diblokir di dua lapis.
     *
     * Kalau `window.cutflow` undefined saat runtime → artinya
     * preload gagal load atau `contextBridge` gagal expose.
     * Cek log preload console untuk diagnosa.
     */
    readonly cutflow: CutFlowApi;
  }
}

/* ============================================================
   WAJIB: penanda module
   ------------------------------------------------------------
   Tanpa `export {}`, TypeScript menganggap file ini "script"
   (bukan "module"), sehingga `declare global` akan error:
     "Augmentations for the global scope can only be directly
      nested in external modules or ambient module declarations."

   Satu statement `export {}` — kosong tapi semantik —
   menjadikan file ini module tanpa mengubah konten global.
   ============================================================ */
export {};
