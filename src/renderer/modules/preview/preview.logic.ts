import type { AppState } from "@shared/types/state";
import type { Clip, Track } from "@shared/types/timeline";
import { DEFAULT_CLIP_AUDIO } from "@shared/types/timeline";

/* ============================================================
   PREVIEW COMPOSITING LOGIC — pure
   ============================================================ */

export type VisualType = "video" | "image" | "text" | "unsupported";

export interface ActiveClipInfo {
  readonly clip: Clip;
  readonly track: Track;
  readonly localTimeSec: number;
  readonly visualType: VisualType;
}

/* ============================================================
   TRANSITION SAMPLE
   ------------------------------------------------------------
   Untuk clip pada waktu tertentu, hitung opacity multiplier +
   layer type (source = beforeClip fade out on top / target =
   afterClip fade in below / none = tidak dalam transition).

   Kinds:
   - cross-dissolve: symmetric fade (a: 1-p, b: p)
   - dip-to-black: 2-phase (first half A fades to black, second
     half B fades from black)
   - lain: fallback ke cross-dissolve
   ============================================================ */

export interface TransitionSample {
  readonly opacity: number;
  readonly volume: number;
  readonly layer: "source" | "target" | "none";
  /** Persen offset horizontal (−100..100). Untuk slide. */
  readonly translateX?: number;
}

const NO_TRANSITION: TransitionSample = {
  opacity: 1,
  volume: 1,
  layer: "none",
};

/**
 * Cek apakah clip aktif di `timeSec`. Aktif jika:
 *   (a) timeSec dalam [start, end), ATAU
 *   (b) timeSec dalam transition window yang melibatkan clip ini
 *       (extension half-duration on either side).
 */
export function isClipActiveAt(
  track: Track,
  clip: Clip,
  timeSec: number,
): boolean {
  const end = clip.startSec + clip.durationSec;
  if (timeSec >= clip.startSec && timeSec < end) return true;

  for (const tr of track.transitions) {
    if (tr.beforeClipId !== clip.id && tr.afterClipId !== clip.id) continue;

    const beforeClip = track.clips.find((c) => c.id === tr.beforeClipId);
    const afterClip = track.clips.find((c) => c.id === tr.afterClipId);
    if (!beforeClip || !afterClip) continue;

    const junction = beforeClip.startSec + beforeClip.durationSec;
    if (Math.abs(junction - afterClip.startSec) > 0.05) continue;

    const half = tr.durationSec / 2;
    if (timeSec >= junction - half && timeSec < junction + half) return true;
  }

  return false;
}

/**
 * Hitung sample transisi untuk clip pada `timeSec` (global).
 */
export function getTransitionSample(
  state: AppState,
  clipId: string,
  timeSec: number,
): TransitionSample {
  const tracks = state.project.sequence.tracks;

  for (const track of tracks) {
    if (track.hidden) continue;

    for (const tr of track.transitions) {
      if (tr.beforeClipId !== clipId && tr.afterClipId !== clipId) continue;

      const beforeClip = track.clips.find((c) => c.id === tr.beforeClipId);
      const afterClip = track.clips.find((c) => c.id === tr.afterClipId);
      if (!beforeClip || !afterClip) continue;

      const junction = beforeClip.startSec + beforeClip.durationSec;
      if (Math.abs(junction - afterClip.startSec) > 0.05) continue;

      const half = tr.durationSec / 2;
      const winStart = junction - half;
      const winEnd = junction + half;
      if (timeSec < winStart || timeSec >= winEnd) continue;

      const progress = (timeSec - winStart) / tr.durationSec; // 0..1

      if (tr.kind === "dip-to-black") {
        /* 2-phase: first half beforeClip fades to black,
           second half afterClip fades from black. */
        if (tr.beforeClipId === clipId) {
          if (progress < 0.5)
            return {
              opacity: 1 - progress * 2,
              volume: 1 - progress,
              layer: "target",
            };
          return { opacity: 0, volume: progress, layer: "target" };
        }
        if (tr.afterClipId === clipId) {
          if (progress >= 0.5)
            return {
              opacity: (progress - 0.5) * 2,
              volume: 1 - progress,
              layer: "target",
            };
          return { opacity: 0, volume: progress, layer: "target" };
        }
      }

      if (tr.kind === "slide") {
        if (tr.beforeClipId === clipId) {
          return {
            opacity: 1,
            volume: 1 - progress,
            layer: "source",
            translateX: -progress * 100,
          };
        }
        if (tr.afterClipId === clipId) {
          return {
            opacity: 1,
            volume: progress,
            layer: "target",
            translateX: (1 - progress) * 100,
          };
        }
      }

      /* Default (cross-dissolve & fallback): symmetric fade. */
      if (tr.beforeClipId === clipId) {
        return { opacity: 1 - progress, volume: 1 - progress, layer: "source" };
      }
      if (tr.afterClipId === clipId) {
        return { opacity: progress, volume: progress, layer: "target" };
      }
    }
  }

  return NO_TRANSITION;
}

/* ============================================================
   ACTIVE CLIPS AT TIME
   ============================================================ */

export function getActiveClipsAtTime(
  state: AppState,
  timeSec: number,
): ActiveClipInfo[] {
  const result: ActiveClipInfo[] = [];
  const tracks = state.project.sequence.tracks;

  for (let i = tracks.length - 1; i >= 0; i--) {
    const track = tracks[i];
    if (!track || track.kind !== "video" || track.hidden) continue;

    for (const clip of track.clips) {
      if (!isClipActiveAt(track, clip, timeSec)) continue;
      result.push({
        clip,
        track,
        localTimeSec: timeSec - clip.startSec,
        visualType: resolveVisualType(clip, state),
      });
    }
  }

  return result;
}

function resolveVisualType(clip: Clip, state: AppState): VisualType {
  if (clip.kind === "text") return "text";
  if (clip.kind === "audio") return "unsupported";

  const asset = state.project.mediaAssets.find(
    (a) => a.id === clip.source.mediaId,
  );
  if (!asset) return "unsupported";
  if (asset.kind === "video") return "video";
  if (asset.kind === "image") return "image";
  return "unsupported";
}

export function sequenceHasAnyClip(state: AppState): boolean {
  return state.project.sequence.tracks.some((t) => t.clips.length > 0);
}

/**
 * Volume efektif clip pada local time tertentu, dengan fade
 * envelope. Return 0..1 (linear). Muted di-handle terpisah.
 */
export function computeClipVolume(clip: Clip, localTimeSec: number): number {
  const audio = clip.audio ?? DEFAULT_CLIP_AUDIO;
  let vol = audio.volume / 100;

  const dur = clip.durationSec;
  if (audio.fadeInSec > 0 && localTimeSec < audio.fadeInSec) {
    vol *= localTimeSec / audio.fadeInSec;
  }
  if (audio.fadeOutSec > 0 && localTimeSec > dur - audio.fadeOutSec) {
    vol *= (dur - localTimeSec) / audio.fadeOutSec;
  }

  return Math.max(0, Math.min(1, vol));
}
