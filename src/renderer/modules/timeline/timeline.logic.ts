import { PLAYBACK, TIMELINE } from "@shared/constants";

/* ============================================================
   TIMELINE LOGIC — pure conversions & labels
   ============================================================ */

export interface RulerLabel {
  readonly sec: number;
  readonly percent: number;
  readonly label: string;
}

/** Pixel (relative ke container) → persen 0..1. */
export function pixelToProgress(
  clientX: number,
  containerRect: DOMRect,
): number {
  if (containerRect.width <= 0) return 0;
  return Math.max(
    0,
    Math.min(1, (clientX - containerRect.left) / containerRect.width),
  );
}

/** Progress (0..1) → waktu (detik). */
export function progressToTime(progress: number, durationSec: number): number {
  return Math.max(0, Math.min(durationSec, progress * durationSec));
}

/** Waktu (detik) → progress (0..1). */
export function timeToProgress(timeSec: number, durationSec: number): number {
  if (durationSec <= 0) return 0;
  return Math.max(0, Math.min(1, timeSec / durationSec));
}

/** Format "M:SS" untuk label ruler. */
export function formatRulerLabel(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Generate label positions sepanjang durasi.
 * Menggunakan `PLAYBACK.RULER_LABEL_INTERVAL_SEC` (5s).
 */
export function computeRulerLabels(durationSec: number): RulerLabel[] {
  const interval = PLAYBACK.RULER_LABEL_INTERVAL_SEC;
  const labels: RulerLabel[] = [];
  for (let sec = 0; sec <= durationSec; sec += interval) {
    labels.push({
      sec,
      percent: timeToProgress(sec, durationSec),
      label: formatRulerLabel(sec),
    });
  }
  return labels;
}

/**
 * Snap waktu ke target terdekat (mis. clip edge terdekat).
 * Return `null` kalau tidak ada yang dalam threshold piksel.
 *
 * @param candidateSec — waktu yang mau di-snap
 * @param targets — array waktu target (detik)
 * @param pxThreshold — jarak maksimum dalam piksel
 * @param pxPerSec — skala saat ini (lebar konten / durasi)
 */
export function snapTime(
  candidateSec: number,
  targets: readonly number[],
  pxThreshold: number,
  pxPerSec: number,
): number | null {
  if (pxPerSec <= 0) return null;
  const thresholdSec = pxThreshold / pxPerSec;

  let nearestSec: number | null = null;
  let nearestDist = Infinity;

  for (const t of targets) {
    const dist = Math.abs(t - candidateSec);
    if (dist < nearestDist && dist <= thresholdSec) {
      nearestDist = dist;
      nearestSec = t;
    }
  }
  return nearestSec;
}

/** Default PX threshold dari constants. */
export const SNAP_THRESHOLD_PX = TIMELINE.SNAP_THRESHOLD_PX;
