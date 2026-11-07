import { appStore } from "@state/appStore";
import { makeId } from "@utils/id";
import {
  DEFAULT_CLIP_TRANSFORM,
  KEYFRAMEABLE_KEYS,
} from "@shared/types/timeline";
import type {
  Clip,
  Keyframe,
  KeyframeMap,
  KeyframeableTransformKey,
} from "@shared/types/timeline";
import {
  sortKeyframes,
  evaluateKeyframeValue,
} from "@modules/keyframes/keyframe.logic";
import { withProject } from "./helpers";

function patchClipKeyframes(
  clipId: string,
  updater: (clip: Clip) => Clip | null,
): void {
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

export function toggleTransformKeyframe(
  clipId: string,
  key: KeyframeableTransformKey,
  playheadLocalSec: number,
): void {
  patchClipKeyframes(clipId, (clip) => {
    const kfs: KeyframeMap = clip.keyframes ?? {};
    const existing = kfs[key] ?? [];
    const local = Math.max(0, Math.min(clip.durationSec, playheadLocalSec));
    const match = existing.find((kf) => Math.abs(kf.timeSec - local) <= 0.05);

    let nextKfsForKey: readonly Keyframe[];
    if (match) {
      nextKfsForKey = existing.filter((kf) => kf.id !== match.id);
    } else {
      const baseVal = clip.transform?.[key] ?? DEFAULT_CLIP_TRANSFORM[key];
      const currentValue = evaluateKeyframeValue(
        existing,
        local,
        baseVal as number,
      );
      nextKfsForKey = sortKeyframes([
        ...existing,
        {
          id: makeId("kf"),
          timeSec: Math.round(local * 1000) / 1000,
          value: currentValue,
        },
      ]);
    }

    return { ...clip, keyframes: { ...kfs, [key]: nextKfsForKey } };
  });
}

export function setClipTransformPropertySmart(
  clipId: string,
  key: KeyframeableTransformKey,
  value: number,
  playheadLocalSec: number,
): void {
  patchClipKeyframes(clipId, (clip) => {
    const kfs: KeyframeMap = clip.keyframes ?? {};
    const existing = kfs[key] ?? [];

    if (existing.length === 0) {
      const base = clip.transform ?? DEFAULT_CLIP_TRANSFORM;
      if (base[key] === value) return null;
      return { ...clip, transform: { ...base, [key]: value } };
    }

    const local = Math.max(0, Math.min(clip.durationSec, playheadLocalSec));
    const match = existing.find((kf) => Math.abs(kf.timeSec - local) <= 0.05);

    let nextKfsForKey: readonly Keyframe[];
    if (match) {
      nextKfsForKey = existing.map((kf) =>
        kf.id === match.id ? { ...kf, value } : kf,
      );
    } else {
      nextKfsForKey = sortKeyframes([
        ...existing,
        { id: makeId("kf"), timeSec: Math.round(local * 1000) / 1000, value },
      ]);
    }
    return { ...clip, keyframes: { ...kfs, [key]: nextKfsForKey } };
  });
}

export function toggleAllKeyframesAtPlayhead(
  clipId: string,
  playheadLocalSec: number,
): void {
  patchClipKeyframes(clipId, (clip) => {
    const local = Math.max(0, Math.min(clip.durationSec, playheadLocalSec));
    const kfs = clip.keyframes ?? {};

    let anyAtPlayhead = false;
    for (const key of KEYFRAMEABLE_KEYS) {
      const arr = kfs[key] ?? [];
      if (arr.some((kf) => Math.abs(kf.timeSec - local) <= 0.05)) {
        anyAtPlayhead = true;
        break;
      }
    }

    const nextKfs: Record<string, readonly Keyframe[]> = { ...kfs };

    if (anyAtPlayhead) {
      for (const key of KEYFRAMEABLE_KEYS) {
        const existing = kfs[key] ?? [];
        if (existing.length === 0) continue;
        const filtered = existing.filter(
          (kf) => Math.abs(kf.timeSec - local) > 0.05,
        );
        if (filtered.length !== existing.length) nextKfs[key] = filtered;
      }
    } else {
      for (const key of KEYFRAMEABLE_KEYS) {
        const existing = kfs[key] ?? [];
        const base = clip.transform?.[key] ?? DEFAULT_CLIP_TRANSFORM[key];
        const effectiveValue = evaluateKeyframeValue(
          existing,
          local,
          base as number,
        );
        const newKf: Keyframe = {
          id: makeId("kf"),
          timeSec: Math.round(local * 1000) / 1000,
          value: effectiveValue,
        };
        nextKfs[key] = sortKeyframes([...existing, newKf]);
      }
    }

    return { ...clip, keyframes: nextKfs };
  });
}
