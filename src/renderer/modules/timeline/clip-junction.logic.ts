import type { Track, Clip, Transition } from "@shared/types/timeline";

/* ============================================================
   CLIP JUNCTION LOGIC
   ------------------------------------------------------------
   Deteksi junction (adjacent clips) di sebuah track. Junction
   = tempat transition bisa berada.

   Adjacent = clip A end ≈ clip B start (tolerance 0.05s).
   ============================================================ */

export const JUNCTION_TOLERANCE_SEC = 0.05;

export interface Junction {
  readonly beforeClip: Clip;
  readonly afterClip: Clip;
  /** Waktu absolute junction (detik). */
  readonly timeSec: number;
  /** Transition existing (kalau ada). */
  readonly existingTransition: Transition | null;
}

export function detectJunctions(track: Track): Junction[] {
  const sorted = [...track.clips].sort((a, b) => a.startSec - b.startSec);
  const junctions: Junction[] = [];

  /* Index transitions by (beforeId, afterId) untuk lookup O(1). */
  const transitionMap = new Map<string, Transition>();
  for (const tr of track.transitions) {
    transitionMap.set(`${tr.beforeClipId}:${tr.afterClipId}`, tr);
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const before = sorted[i];
    const after = sorted[i + 1];
    if (!before || !after) continue;

    const beforeEnd = before.startSec + before.durationSec;
    const gap = after.startSec - beforeEnd;

    if (Math.abs(gap) <= JUNCTION_TOLERANCE_SEC) {
      junctions.push({
        beforeClip: before,
        afterClip: after,
        timeSec: beforeEnd,
        existingTransition:
          transitionMap.get(`${before.id}:${after.id}`) ?? null,
      });
    }
  }

  return junctions;
}
