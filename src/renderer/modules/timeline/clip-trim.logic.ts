import type { Clip } from "@shared/types/timeline";

/* ============================================================
   CLIP TRIM LOGIC — pure
   ============================================================ */

export const MIN_CLIP_DURATION_SEC = 0.1;

/**
 * Hitung durasi baru dari drag pada right handle.
 *
 * @param initialDur — durasi saat drag mulai
 * @param deltaSec — pergeseran horizontal dalam detik (positif = extend)
 * @param maxDur — batas maksimum (asset duration & sisa sequence)
 */
export function computeTrimDuration(
  initialDur: number,
  deltaSec: number,
  maxDur: number,
): number {
  const raw = initialDur + deltaSec;
  const clamped = Math.max(MIN_CLIP_DURATION_SEC, Math.min(maxDur, raw));
  return Math.round(clamped * 1000) / 1000; // 1ms precision
}

/**
 * Cek apakah clip bisa di-trim ke kanan. Text clip tidak bisa
 * (tidak ada konsep durasi sumber), tapi kita izinkan juga
 * karena semantic-nya "duration = display duration".
 */
export function canTrimClip(clip: Clip): boolean {
  return clip.kind === "video" || clip.kind === "audio" || clip.kind === "text";
}
