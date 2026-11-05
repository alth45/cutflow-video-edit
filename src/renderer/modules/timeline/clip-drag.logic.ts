import type { Track } from "@shared/types/timeline";
import { TIMELINE } from "@shared/constants";

/* ============================================================
   CLIP DRAG LOGIC — pure functions
   ------------------------------------------------------------
   Semua fungsi murni: input → output, tanpa DOM, tanpa store.
   Controller (F14b) memanggilnya dari mousemove handler.
   ============================================================ */

export type SnapSource = "clip" | "playhead" | "bound";

export interface SnapCandidate {
  readonly sec: number;
  readonly source: SnapSource;
}

export interface DragPositionResult {
  readonly startSec: number;
  readonly snapped: SnapCandidate | null;
}

/**
 * Kumpulkan titik snap: clip edges (start & end dari clip LAIN),
 * playhead, dan boundaries (0 dan duration).
 *
 * Skip clip yang sedang di-drag — kita tidak mau clip snap ke
 * posisinya sendiri.
 */
export function computeSnapTargets(
  excludedClipIds: readonly string[],
  tracks: readonly Track[],
  playheadSec: number,
  durationSec: number,
): SnapCandidate[] {
  const excluded = new Set(excludedClipIds);
  const targets: SnapCandidate[] = [
    { sec: 0, source: "bound" },
    { sec: durationSec, source: "bound" },
  ];

  if (playheadSec >= 0 && playheadSec <= durationSec) {
    targets.push({ sec: playheadSec, source: "playhead" });
  }

  for (const track of tracks) {
    for (const clip of track.clips) {
      if (excluded.has(clip.id)) continue;
      targets.push({ sec: clip.startSec, source: "clip" });
      targets.push({ sec: clip.startSec + clip.durationSec, source: "clip" });
    }
  }

  return targets;
}

/**
 * Cari target terdekat dalam threshold. Return `snapped: null`
 * kalau tidak ada yang masuk threshold.
 */
export function snapToTargets(
  candidateSec: number,
  targets: readonly SnapCandidate[],
  thresholdSec: number,
): { sec: number; snapped: SnapCandidate | null } {
  let nearest: SnapCandidate | null = null;
  let nearestDist = Infinity;

  for (const t of targets) {
    const d = Math.abs(t.sec - candidateSec);
    if (d < nearestDist && d <= thresholdSec) {
      nearestDist = d;
      nearest = t;
    }
  }

  return nearest
    ? { sec: nearest.sec, snapped: nearest }
    : { sec: candidateSec, snapped: null };
}

/**
 * Hitung posisi start baru untuk clip yang di-drag.
 *
 * Alur:
 * 1. `candidate = initialStart + delta` (dari pixel movement).
 * 2. Clamp ke [0, duration - clipDuration].
 * 3. Jika snap enabled: snap ke target terdekat.
 * 4. Clamp ulang setelah snap (target bisa di luar bounds).
 *
 * Return `snapped` hanya jika snap menghasilkan posisi yang
 * masih dalam bounds — kalau tidak (misal target = duration,
 * tapi clip tidak bisa start di duration), skip snap dan
 * kembalikan null (tidak tampilkan guide).
 */
export function computeDragPosition(
  initialStartSec: number,
  deltaSec: number,
  clipDurationSec: number,
  durationSec: number,
  snapEnabled: boolean,
  targets: readonly SnapCandidate[],
  thresholdSec: number,
): DragPositionResult {
  const maxStart = Math.max(0, durationSec - clipDurationSec);
  const raw = initialStartSec + deltaSec;
  const clamped = Math.max(0, Math.min(maxStart, raw));

  if (!snapEnabled) {
    return { startSec: clamped, snapped: null };
  }

  const result = snapToTargets(clamped, targets, thresholdSec);
  const finalStart = Math.max(0, Math.min(maxStart, result.sec));

  /* Kalau clamp mengubah posisi snap, snap guide akan misleading
     (menunjuk ke tempat yang tidak dicapai). Sembunyikan guide. */
  if (finalStart !== result.sec) {
    return { startSec: finalStart, snapped: null };
  }

  return { startSec: finalStart, snapped: result.snapped };
}

/* ============================================================
   MULTI-DRAG
   ------------------------------------------------------------
   Saat drag N clip sekaligus, delta harus memenuhi constraint
   SEMUA clip (bukan hanya primary):
     newStart_i = initial_i + delta ∈ [0, seqDur - dur_i]
   =>  delta ∈ [-min(initial_i), min(seqDur - dur_i - initial_i)]
   ============================================================ */

export interface DraggedClipState {
  readonly initialStartSec: number;
  readonly durationSec: number;
}

export interface MultiDragBounds {
  readonly minDelta: number;
  readonly maxDelta: number;
}

export function computeMultiDragBounds(
  clips: readonly DraggedClipState[],
): MultiDragBounds {
  if (clips.length === 0) return { minDelta: 0, maxDelta: 0 };

  const MAX = TIMELINE.MAX_SEQUENCE_DURATION_SEC;
  let minStart = Infinity;
  let minRoom = Infinity;

  for (const c of clips) {
    if (c.initialStartSec < minStart) minStart = c.initialStartSec;
    const room = MAX - c.durationSec - c.initialStartSec;
    if (room < minRoom) minRoom = room;
  }

  return {
    minDelta: -minStart,
    maxDelta: Math.max(0, minRoom),
  };
}

export interface MultiDragResult {
  readonly deltaSec: number;
  readonly snapped: SnapCandidate | null;
}

/**
 * Hitung delta final untuk multi-drag: clamp → snap (primary) → re-clamp.
 * Snap hanya dipakai kalau delta snapped masih dalam bounds grup.
 */
export function computeMultiDragDelta(
  rawDeltaSec: number,
  primaryInitialStartSec: number,
  bounds: MultiDragBounds,
  snapEnabled: boolean,
  targets: readonly SnapCandidate[],
  thresholdSec: number,
): MultiDragResult {
  const clamped = Math.max(
    bounds.minDelta,
    Math.min(bounds.maxDelta, rawDeltaSec),
  );

  if (!snapEnabled) {
    return { deltaSec: clamped, snapped: null };
  }

  const primaryNewStart = primaryInitialStartSec + clamped;
  const snapResult = snapToTargets(primaryNewStart, targets, thresholdSec);

  if (!snapResult.snapped) {
    return { deltaSec: clamped, snapped: null };
  }

  const snappedDelta = snapResult.sec - primaryInitialStartSec;

  /* Snap hanya valid kalau tidak melanggar bounds grup — kalau
     melanggar, abaikan snap (guide disembunyikan). */
  if (snappedDelta < bounds.minDelta || snappedDelta > bounds.maxDelta) {
    return { deltaSec: clamped, snapped: null };
  }

  return { deltaSec: snappedDelta, snapped: snapResult.snapped };
}
