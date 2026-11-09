import { appStore } from "@state/appStore";
import { PLAYBACK, TIMELINE } from "@shared/constants";
import type { AppState, HistorySnapshot } from "@shared/types/state";
import type { Project } from "@shared/types/project";
import type { TrackKind, ClipKind, Track } from "@shared/types/timeline";

/* ============================================================
   INTERNAL HELPERS — dipakai oleh semua action modules.
   Tidak di-export dari index.ts (internal API).
   ============================================================ */

const MAX_HISTORY = 100;

export function withProject(state: AppState, next: Project): AppState {
  const snapshot: HistorySnapshot = {
    project: state.project,
    isDirty: state.isDirty,
  };
  let past = [...state.history.past, snapshot];
  if (past.length > MAX_HISTORY) past = past.slice(-MAX_HISTORY);

  return {
    ...state,
    project: next,
    isDirty: true,
    history: { past, future: [] },
  };
}

export function computeContentEnd(tracks: readonly Track[]): number {
  let maxEnd = 0;
  for (const track of tracks) {
    for (const clip of track.clips) {
      const end = clip.startSec + clip.durationSec;
      if (end > maxEnd) maxEnd = end;
    }
  }
  return maxEnd;
}

/**
 * Auto-adjust sequence duration ke content bounds (extend/shrink).
 * Clamp playhead ke durasi baru. Return state (bukan project) karena
 * perlu update playback juga.
 */
export function withAutoAdjust(
  state: AppState,
  nextProject: Project,
): AppState {
  const contentEnd = computeContentEnd(nextProject.sequence.tracks);
  const currentDur = nextProject.sequence.durationSec;

  let targetDur: number;
  if (contentEnd <= 0) {
    targetDur = PLAYBACK.DURATION_SEC;
  } else {
    const capped = Math.min(contentEnd, TIMELINE.MAX_SEQUENCE_DURATION_SEC);
    const rounded = Math.ceil(capped * 10) / 10;
    targetDur = Math.max(rounded, TIMELINE.MIN_SEQUENCE_DURATION_SEC);
  }

  const nextProj =
    targetDur !== currentDur
      ? {
          ...nextProject,
          sequence: { ...nextProject.sequence, durationSec: targetDur },
        }
      : nextProject;

  const clampedTime = Math.min(state.playback.currentTimeSec, targetDur);
  const playback =
    clampedTime !== state.playback.currentTimeSec
      ? { ...state.playback, currentTimeSec: clampedTime }
      : state.playback;

  const next = withProject(state, nextProj);
  return playback !== state.playback ? { ...next, playback } : next;
}

export function isClipCompatible(
  trackKind: TrackKind,
  clipKind: ClipKind,
): boolean {
  if (trackKind === "audio") return clipKind === "audio";
  return clipKind === "video" || clipKind === "text" || clipKind === "shape";
}

export function getAppState(): AppState {
  return appStore.getState();
}
