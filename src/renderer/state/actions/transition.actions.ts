import { appStore } from "@state/appStore";
import { makeId } from "@utils/id";
import { getTrackById } from "@state/selectors";
import type { Transition, TransitionKind } from "@shared/types/timeline";
import { withProject } from "./helpers";

const DEFAULT_TRANSITION_DURATION_SEC = 0.5;

export function addTransition(
  trackId: string,
  beforeClipId: string,
  afterClipId: string,
  kind: TransitionKind = "cross-dissolve",
  durationSec = DEFAULT_TRANSITION_DURATION_SEC,
): void {
  appStore.setState((state) => {
    const track = getTrackById(state, trackId);
    if (!track || track.locked) return state;

    const before = track.clips.find((c) => c.id === beforeClipId);
    const after = track.clips.find((c) => c.id === afterClipId);
    if (!before || !after) return state;

    const junction = before.startSec + before.durationSec;
    if (Math.abs(junction - after.startSec) > 0.05) return state;

    if (
      track.transitions.some(
        (t) => t.beforeClipId === beforeClipId && t.afterClipId === afterClipId,
      )
    )
      return state;

    const maxDur = Math.min(before.durationSec, after.durationSec);
    const dur = Math.max(0.05, Math.min(durationSec, maxDur));

    const transition: Transition = {
      id: makeId("clip"),
      beforeClipId,
      afterClipId,
      kind,
      durationSec: dur,
    };

    const nextProject = {
      ...state.project,
      sequence: {
        ...state.project.sequence,
        tracks: state.project.sequence.tracks.map((t) =>
          t.id === trackId
            ? { ...t, transitions: [...t.transitions, transition] }
            : t,
        ),
      },
    };

    return {
      ...withProject(state, nextProject),
      selection: {
        ...state.selection,
        selectedClipIds: [],
        selectedTransitionId: transition.id,
      },
    };
  });
}

export function setTransitionKind(
  transitionId: string,
  kind: TransitionKind,
): void {
  appStore.setState((state) => {
    for (const track of state.project.sequence.tracks) {
      if (track.locked) continue;
      const idx = track.transitions.findIndex((t) => t.id === transitionId);
      if (idx < 0) continue;
      const tr = track.transitions[idx];
      if (!tr || tr.kind === kind) return state;

      const nextTransitions = [...track.transitions];
      nextTransitions[idx] = { ...tr, kind };
      const nextProject = {
        ...state.project,
        sequence: {
          ...state.project.sequence,
          tracks: state.project.sequence.tracks.map((t) =>
            t.id === track.id ? { ...t, transitions: nextTransitions } : t,
          ),
        },
      };
      return withProject(state, nextProject);
    }
    return state;
  });
}

export function removeTransition(transitionId: string): void {
  appStore.setState((state) => {
    for (const track of state.project.sequence.tracks) {
      if (!track.transitions.some((t) => t.id === transitionId)) continue;
      if (track.locked) return state;

      const nextProject = {
        ...state.project,
        sequence: {
          ...state.project.sequence,
          tracks: state.project.sequence.tracks.map((t) =>
            t.id === track.id
              ? {
                  ...t,
                  transitions: t.transitions.filter(
                    (tr) => tr.id !== transitionId,
                  ),
                }
              : t,
          ),
        },
      };

      return {
        ...withProject(state, nextProject),
        selection: {
          ...state.selection,
          selectedTransitionId:
            state.selection.selectedTransitionId === transitionId
              ? null
              : state.selection.selectedTransitionId,
        },
      };
    }
    return state;
  });
}
