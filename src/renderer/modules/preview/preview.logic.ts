import type { AppState } from "@shared/types/state";
import {
  DEFAULT_CLIP_AUDIO,
  type Clip,
  type Track,
  type Transition,
} from "@shared/types/timeline";

/* ============================================================
   PREVIEW COMPOSITING LOGIC — pure
   ============================================================ */

export type VisualType = "video" | "image" | "text" | "shape" | "unsupported";

export interface ActiveClipInfo {
  readonly clip: Clip;
  readonly track: Track;
  readonly localTimeSec: number;
  readonly visualType: VisualType;
}

/* ============================================================
   TRANSITION SAMPLE
   ------------------------------------------------------------
   Per-clip transition state at a given time. Fields optional —
   only set for transitions that need them (e.g., `blurPx` for
   zoom-blur, `clipPath` for wipes).

   Layer semantics:
   - 'source' = beforeClip (fade-out on top)
   - 'target' = afterClip (reveal below or above via zAbove)
   - 'none'   = no transition active
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

/* ============================================================
   TRANSITION WINDOW LOOKUP (shared)
   ------------------------------------------------------------
   Dipakai oleh isClipActiveAt + getTransitionSample. Return
   context if `timeSec` falls inside an active transition window
   involving `clipId`. Null = no active transition.
   ============================================================ */
interface TransitionContext {
  readonly transition: Transition;
  readonly progress: number; // 0..1 (winStart → winEnd)
}

function findTransitionContext(
  track: Track,
  clipId: string,
  timeSec: number,
): TransitionContext | null {
  for (const tr of track.transitions) {
    if (tr.beforeClipId !== clipId && tr.afterClipId !== clipId) continue;

    const beforeClip = track.clips.find((c) => c.id === tr.beforeClipId);
    const afterClip = track.clips.find((c) => c.id === tr.afterClipId);
    if (!beforeClip || !afterClip) continue;

    /* Require clips to be adjacent (tolerance 0.05s). */
    const junction = beforeClip.startSec + beforeClip.durationSec;
    if (Math.abs(junction - afterClip.startSec) > 0.05) continue;

    const half = tr.durationSec / 2;
    const winStart = junction - half;
    const winEnd = junction + half;
    if (timeSec < winStart || timeSec >= winEnd) continue;

    return {
      transition: tr,
      progress: (timeSec - winStart) / tr.durationSec,
    };
  }
  return null;
}

/* ============================================================
   CLIP ACTIVE CHECK
   ------------------------------------------------------------
   Clip aktif jika dalam range normalnya OR di dalam window
   transisi yang melibatkannya.
   ============================================================ */
export function isClipActiveAt(
  track: Track,
  clip: Clip,
  timeSec: number,
): boolean {
  const end = clip.startSec + clip.durationSec;
  if (timeSec >= clip.startSec && timeSec < end) return true;
  return findTransitionContext(track, clip.id, timeSec) !== null;
}

/* ============================================================
   TRANSITION SAMPLE
   ------------------------------------------------------------
   Cari transition yang melibatkan clipId at timeSec, lalu
   bangun sample berdasarkan `kind`.
   ============================================================ */
export function getTransitionSample(
  state: AppState,
  clipId: string,
  timeSec: number,
): TransitionSample {
  for (const track of state.project.sequence.tracks) {
    if (track.hidden) continue;
    const ctx = findTransitionContext(track, clipId, timeSec);
    if (ctx) return buildTransitionSample(ctx, clipId);
  }
  return NO_TRANSITION;
}

function buildTransitionSample(
  ctx: TransitionContext,
  clipId: string,
): TransitionSample {
  const { transition: tr, progress: p } = ctx;
  const isBefore = tr.beforeClipId === clipId;
  const vol = isBefore ? 1 - p : p;

  switch (tr.kind) {
    case "cross-dissolve":
      return isBefore
        ? { opacity: 1 - p, volume: vol, layer: "source" }
        : { opacity: 1, volume: vol, layer: "target" };

    case "dip-to-black":
      return isBefore
        ? { opacity: Math.max(0, 1 - p * 2), volume: vol, layer: "target" }
        : { opacity: Math.max(0, (p - 0.5) * 2), volume: vol, layer: "target" };

    case "dip-to-white":
      return {
        opacity: isBefore ? Math.max(0, 1 - p * 2) : Math.max(0, (p - 0.5) * 2),
        volume: vol,
        layer: "target",
        fadeOverlay: "white",
      };

    case "slide":
      return isBefore
        ? { opacity: 1, volume: vol, layer: "source", translateX: -p * 100 }
        : {
            opacity: 1,
            volume: vol,
            layer: "target",
            translateX: (1 - p) * 100,
          };

    case "slide-vertical":
      return isBefore
        ? { opacity: 1, volume: vol, layer: "source", translateY: -p * 100 }
        : {
            opacity: 1,
            volume: vol,
            layer: "target",
            translateY: (1 - p) * 100,
          };

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

    case "circle-wipe": {
      const radius = p * 75; // overshoot cover corner
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

/* ============================================================
   ACTIVE CLIPS AT TIME
   ------------------------------------------------------------
   Iterates tracks bottom → top (last track index first).
   Nested clips expanded to their inner active clips.
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

      if (clip.kind === "nested") {
        expandNestedClip(clip, track, timeSec, state, result);
      } else {
        result.push({
          clip,
          track,
          localTimeSec: timeSec - clip.startSec,
          visualType: resolveVisualType(clip, state),
        });
      }
    }
  }

  return result;
}

/**
 * Expand nested clip ke inner active clips. Inner clips carry
 * their own transform/effects; parent track dipakai untuk z-index.
 */
function expandNestedClip(
  nestedClip: Clip,
  parentTrack: Track,
  timeSec: number,
  state: AppState,
  out: ActiveClipInfo[],
): void {
  if (nestedClip.kind !== "nested") return;

  const localTimeSec = timeSec - nestedClip.startSec;
  if (localTimeSec < 0 || localTimeSec >= nestedClip.durationSec) return;

  for (const innerTrack of nestedClip.source.tracks) {
    if (innerTrack.hidden) continue;
    for (const innerClip of innerTrack.clips) {
      const innerEnd = innerClip.startSec + innerClip.durationSec;
      if (localTimeSec < innerClip.startSec || localTimeSec >= innerEnd) {
        continue;
      }

      out.push({
        clip: innerClip,
        track: parentTrack,
        localTimeSec: localTimeSec - innerClip.startSec,
        visualType: resolveVisualType(innerClip, state),
      });
    }
  }
}

function resolveVisualType(clip: Clip, state: AppState): VisualType {
  if (clip.kind === "text") return "text";
  if (clip.kind === "shape") return "shape";
  if (clip.kind === "audio") return "unsupported";

  /* Defensive: nested clips are expanded before reaching here.
     Return unsupported if any slip through (should not happen). */
  if (clip.kind === "nested") return "unsupported";

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

/* ============================================================
   AUDIO VOLUME ENVELOPE
   ------------------------------------------------------------
   Return 0..1 (linear). Mute & boost di-handle terpisah di
   caller (audio-engine setParams).
   ============================================================ */
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
