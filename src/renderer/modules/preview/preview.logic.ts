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
  readonly translateX?: number;
  readonly translateY?: number;
  readonly scale?: number; // multiplier of base scale
  readonly blurPx?: number;
  readonly clipPath?: string;
  readonly zAbove?: boolean; // override z-index (+1)
  readonly fadeOverlay?: "white" | "black" | null;
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

      const p = (timeSec - winStart) / tr.durationSec; // 0..1
      const isBefore = tr.beforeClipId === clipId;

      /* ---- Volume: symmetric fade (all kinds) ---- */
      const vol = isBefore ? 1 - p : p;

      switch (tr.kind) {
        /* ---- Cross-dissolve ---- */
        case "cross-dissolve":
          return isBefore
            ? { opacity: 1 - p, volume: vol, layer: "source" }
            : { opacity: 1, volume: vol, layer: "target" };

        /* ---- Dip to Black ---- */
        case "dip-to-black":
          return isBefore
            ? { opacity: Math.max(0, 1 - p * 2), volume: vol, layer: "target" }
            : {
                opacity: Math.max(0, (p - 0.5) * 2),
                volume: vol,
                layer: "target",
              };

        /* ---- Dip to White (NEW) ---- */
        case "dip-to-white":
          return {
            opacity: isBefore
              ? Math.max(0, 1 - p * 2)
              : Math.max(0, (p - 0.5) * 2),
            volume: vol,
            layer: "target",
            fadeOverlay: "white",
          };

        /* ---- Slide (existing, horizontal) ---- */
        case "slide":
          return isBefore
            ? { opacity: 1, volume: vol, layer: "source", translateX: -p * 100 }
            : {
                opacity: 1,
                volume: vol,
                layer: "target",
                translateX: (1 - p) * 100,
              };

        /* ---- Slide Vertical (NEW) ---- */
        case "slide-vertical":
          return isBefore
            ? { opacity: 1, volume: vol, layer: "source", translateY: -p * 100 }
            : {
                opacity: 1,
                volume: vol,
                layer: "target",
                translateY: (1 - p) * 100,
              };

        /* ---- Zoom Blur (fixed — sekarang render) ---- */
        case "zoom-blur": {
          const zoomAmt = 0.5;
          const blurMax = 15;
          return isBefore
            ? {
                opacity: 1 - p,
                volume: vol,
                layer: "source",
                scale: 1 + p * zoomAmt,
                blurPx: p * blurMax,
              }
            : {
                opacity: 1,
                volume: vol,
                layer: "target",
                scale: 1 - (1 - p) * zoomAmt,
                blurPx: (1 - p) * blurMax,
              };
        }

        /* ---- Wipe (fixed — sekarang render, horizontal dari kiri) ---- */
        case "wipe":
          return isBefore
            ? { opacity: 1, volume: vol, layer: "target" }
            : {
                opacity: 1,
                volume: vol,
                layer: "target",
                zAbove: true,
                clipPath: `inset(0 ${(1 - p) * 100}% 0 0)`,
              };

        /* ---- Circle Wipe (NEW) ---- */
        case "circle-wipe": {
          const radius = p * 75; // overshoot untuk cover corner
          return isBefore
            ? { opacity: 1, volume: vol, layer: "target" }
            : {
                opacity: 1,
                volume: vol,
                layer: "target",
                zAbove: true,
                clipPath: `circle(${radius}% at 50% 50%)`,
              };
        }

        /* ---- Barn Doors (NEW) ---- */
        case "barn-doors": {
          const inset = (1 - p) * 50;
          return isBefore
            ? { opacity: 1, volume: vol, layer: "target" }
            : {
                opacity: 1,
                volume: vol,
                layer: "target",
                zAbove: true,
                clipPath: `inset(0 ${inset}% 0 ${inset}%)`,
              };
        }

        /* ---- Cross Zoom (NEW) ---- */
        case "cross-zoom":
          return isBefore
            ? {
                opacity: 1 - p,
                volume: vol,
                layer: "source",
                scale: 1 + p * 0.5,
              }
            : {
                opacity: 1,
                volume: vol,
                layer: "target",
                scale: 0.5 + p * 0.5,
              };
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
