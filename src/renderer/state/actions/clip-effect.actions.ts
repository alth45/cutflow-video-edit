import { appStore } from "@state/appStore";
import { createDefaultEffect } from "@modules/effects/effect.logic";
import type {
  EffectKind,
  AnimationKind,
  Clip,
  ClipEffect,
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

export function addEffectToClip(clipId: string, kind: EffectKind): void {
  patchClip(clipId, (clip) => {
    const effects = clip.effects ?? [];
    const existing = effects.find((e) => e.kind === kind);

    let nextEffects: readonly ClipEffect[];
    if (existing) {
      nextEffects = effects.map((e) =>
        e.id === existing.id ? { ...e, enabled: !e.enabled } : e,
      );
    } else {
      const newEffect = createDefaultEffect(kind);
      if (!newEffect) return null;
      nextEffects = [...effects, newEffect];
    }
    return { ...clip, effects: nextEffects };
  });
}

export function removeEffectFromClip(clipId: string, effectId: string): void {
  patchClip(clipId, (clip) => {
    const effects = clip.effects ?? [];
    if (!effects.some((e) => e.id === effectId)) return null;
    return { ...clip, effects: effects.filter((e) => e.id !== effectId) };
  });
}

export function toggleClipAnimation(clipId: string, kind: AnimationKind): void {
  patchClip(clipId, (clip) => {
    const current = clip.animation ?? null;
    const next = current?.kind === kind ? null : { kind };
    if ((current?.kind ?? null) === (next?.kind ?? null)) return null;
    return { ...clip, animation: next };
  });
}
