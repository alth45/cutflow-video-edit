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
} from "@shared/types/timeline";
import { withProject } from "./helpers";

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

export function setClipColorProperty<K extends keyof ClipColor>(
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
