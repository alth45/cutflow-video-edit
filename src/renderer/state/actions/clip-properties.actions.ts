import { appStore } from "@state/appStore";
import {
  DEFAULT_CLIP_TRANSFORM,
  DEFAULT_CLIP_COLOR,
  DEFAULT_CLIP_AUDIO,
} from "@shared/types/timeline";
import type {
  Clip,
  ClipTransform,
  ClipColor,
  ClipAudio,
  NumericClipColorKey,
} from "@shared/types/timeline";
import { withProject } from "./helpers";

import { DEFAULT_CHROMA_KEY } from "@shared/types/timeline";
import type { ClipChromaKey } from "@shared/types/timeline";
import type { CurvePoint, ClipCurve } from "@shared/types/timeline";
import { DEFAULT_CURVE } from "@shared/types/timeline";

function patchClip(clipId: string, updater: (clip: Clip) => Clip | null): void {
  appStore.setState((state) => {
    for (const track of state.project.sequence.tracks) {
      if (track.locked) continue;
      const idx = track.clips.findIndex((c) => c.id === clipId);
      if (idx < 0) continue;
      const clip = track.clips[idx];
      if (!clip) return state;
      const next = updater(clip);
      if (!next) return state;

      const nextClips = [...track.clips];
      nextClips[idx] = next;
      const nextProject = {
        ...state.project,
        sequence: {
          ...state.project.sequence,
          tracks: state.project.sequence.tracks.map((t) =>
            t.id === track.id ? { ...t, clips: nextClips } : t,
          ),
        },
      };
      return withProject(state, nextProject);
    }
    return state;
  });
}

export function setClipTransformProperty<K extends keyof ClipTransform>(
  clipId: string,
  key: K,
  value: ClipTransform[K],
): void {
  patchClip(clipId, (clip) => {
    const current = clip.transform ?? DEFAULT_CLIP_TRANSFORM;
    if (current[key] === value) return null;
    return { ...clip, transform: { ...current, [key]: value } };
  });
}

export function setClipTransformBulk(
  clipId: string,
  updates: Partial<ClipTransform>,
): void {
  patchClip(clipId, (clip) => {
    const current = clip.transform ?? DEFAULT_CLIP_TRANSFORM;
    const next = { ...current };
    let changed = false;
    (Object.keys(updates) as Array<keyof ClipTransform>).forEach((key) => {
      const value = updates[key];
      if (value !== undefined && current[key] !== value) {
        (next as Record<keyof ClipTransform, unknown>)[key] = value;
        changed = true;
      }
    });
    if (!changed) return null;
    return { ...clip, transform: next };
  });
}

export function setClipColorProperty<K extends NumericClipColorKey>(
  clipId: string,
  key: K,
  value: ClipColor[K],
): void {
  patchClip(clipId, (clip) => {
    const current = clip.color ?? DEFAULT_CLIP_COLOR;
    if (current[key] === value) return null;
    return { ...clip, color: { ...current, [key]: value } };
  });
}

export function setClipAudioProperty<K extends keyof ClipAudio>(
  clipId: string,
  key: K,
  value: ClipAudio[K],
): void {
  patchClip(clipId, (clip) => {
    const current = clip.audio ?? DEFAULT_CLIP_AUDIO;
    if (current[key] === value) return null;
    return { ...clip, audio: { ...current, [key]: value } };
  });
}

export function setClipChromaKey<K extends keyof ClipChromaKey>(
  clipId: string,
  key: K,
  value: ClipChromaKey[K],
): void {
  patchClip(clipId, (clip) => {
    const current = clip.chromaKey ?? DEFAULT_CHROMA_KEY;
    if (current[key] === value) return null;
    return { ...clip, chromaKey: { ...current, [key]: value } };
  });
}

/**
 * Set curve points. Sanity: sort by x, clamp 0..100. Skip if same
 * as current (no-op). 1 history entry per call.
 */
export function setClipCurve(
  clipId: string,
  points: readonly CurvePoint[],
): void {
  if (points.length < 2) return;

  patchClip(clipId, (clip) => {
    const sorted = [...points]
      .map((p) => ({
        x: Math.max(0, Math.min(100, p.x)),
        y: Math.max(0, Math.min(100, p.y)),
      }))
      .sort((a, b) => a.x - b.x);

    const current = clip.color ?? DEFAULT_CLIP_COLOR;
    const currentPoints = current.curve?.points ?? DEFAULT_CURVE.points;

    /* No-op check. */
    if (currentPoints.length === sorted.length) {
      const same = currentPoints.every(
        (p, i) =>
          Math.abs(p.x - sorted[i]!.x) < 0.01 &&
          Math.abs(p.y - sorted[i]!.y) < 0.01,
      );
      if (same) return null;
    }

    const nextCurve: ClipCurve = { points: sorted };
    return { ...clip, color: { ...current, curve: nextCurve } };
  });
}
