import type { Clip } from "@shared/types/timeline";

/* ============================================================
   CLIP SPLIT LOGIC
   ------------------------------------------------------------
   Pure helpers untuk split. Validasi utama (panjang minimum,
   track locked) ada di action — logic di sini hanya kalkulasi.
   ============================================================ */

/** Minimum duration untuk tiap half setelah split (UX-level). */
export const SPLIT_MIN_DURATION_SEC = 0.1;

/**
 * Cek apakah split valid: kedua half ≥ SPLIT_MIN_DURATION_SEC.
 * Split tepat di edge (0% atau 100%) = tidak valid.
 */
export function canSplitAt(clip: Clip, splitTimeSec: number): boolean {
  const clipEnd = clip.startSec + clip.durationSec;
  return (
    splitTimeSec > clip.startSec + SPLIT_MIN_DURATION_SEC &&
    splitTimeSec < clipEnd - SPLIT_MIN_DURATION_SEC
  );
}

/**
 * Hitung rasio klik (0..1) di dalam clip berdasarkan posisi mouse
 * relatif terhadap rect clip element.
 */
export function computeClickRatio(clientX: number, clipRect: DOMRect): number {
  if (clipRect.width <= 0) return 0;
  return Math.max(0, Math.min(1, (clientX - clipRect.left) / clipRect.width));
}

/**
 * Konversi ratio → absolute time dalam sequence.
 */
export function ratioToSplitTime(
  ratio: number,
  clipStartSec: number,
  clipDurationSec: number,
): number {
  return clipStartSec + ratio * clipDurationSec;
}
