import { appStore } from "@state/appStore";
import { TIMELINE } from "@shared/constants";
import { makeId } from "@utils/id";
import {
  getClipById,
  getTrackById,
  getMaxClipDuration,
} from "@state/selectors";
import type { Clip, ClipKind, TrackKind } from "@shared/types/timeline";
import { withAutoAdjust, isClipCompatible } from "./helpers";

export function addClip(trackId: string, clip: Clip): void {
  appStore.setState((state) => {
    if (clip.durationSec <= 0) return state;
    const track = getTrackById(state, trackId);
    if (!track) return state;
    if (!isClipCompatible(track.kind, clip.kind)) return state;
    if (getClipById(state, clip.id)) return state;

    const nextTrack = { ...track, clips: [...track.clips, clip] };
    const nextProject = {
      ...state.project,
      sequence: {
        ...state.project.sequence,
        tracks: state.project.sequence.tracks.map((t) =>
          t.id === trackId ? nextTrack : t,
        ),
      },
    };
    return withAutoAdjust(state, nextProject);
  });
}

/** Bulk add — 1 history entry. Skip clip yang ID duplikat / incompatible. */
export function addClipsBulk(
  items: readonly { trackId: string; clip: Clip }[],
): void {
  if (items.length === 0) return;

  appStore.setState((state) => {
    const tracks = [...state.project.sequence.tracks];
    let changed = false;

    for (const { trackId, clip } of items) {
      const idx = tracks.findIndex((t) => t.id === trackId);
      if (idx < 0) continue;
      const track = tracks[idx];
      if (!track || track.locked) continue;
      if (clip.durationSec <= 0) continue;
      if (!isClipCompatible(track.kind, clip.kind)) continue;
      if (tracks.some((t) => t.clips.some((c) => c.id === clip.id))) continue;

      tracks[idx] = { ...track, clips: [...track.clips, clip] };
      changed = true;
    }

    if (!changed) return state;

    const nextProject = {
      ...state.project,
      sequence: { ...state.project.sequence, tracks },
    };
    return withAutoAdjust(state, nextProject); // ← FIX: clean return
  });
}

export function moveClip(clipId: string, newStartSec: number): void {
  appStore.setState((state) => {
    for (const track of state.project.sequence.tracks) {
      const idx = track.clips.findIndex((c) => c.id === clipId);
      if (idx === -1) continue;

      const clip = track.clips[idx];
      if (!clip) return state;

      const maxStart = Math.max(
        0,
        TIMELINE.MAX_SEQUENCE_DURATION_SEC - clip.durationSec,
      );
      const clamped = Math.max(0, Math.min(maxStart, newStartSec));
      if (clamped === clip.startSec) return state;

      const nextClips = [...track.clips];
      nextClips[idx] = { ...clip, startSec: clamped };
      const nextProject = {
        ...state.project,
        sequence: {
          ...state.project.sequence,
          tracks: state.project.sequence.tracks.map((t) =>
            t.id === track.id ? { ...t, clips: nextClips } : t,
          ),
        },
      };
      return withAutoAdjust(state, nextProject);
    }
    return state;
  });
}

/**
 * Move multiple clips sekaligus (digunakan oleh clip-drag.controller
 * saat multi-select drag).
 *
 * Design contract dengan controller:
 * - Controller menghitung `delta` dari drag bounds (via
 *   `computeMultiDragBounds` di `clip-drag.logic.ts`) yang sudah
 *   di-clamp ke `[0, MAX_SEQUENCE_DURATION_SEC - clip.durationSec]`
 *   per clip.
 * - Controller mengirim `startSec` absolut (initial + delta),
 *   bukan delta. Function ini hanya clamp defensive.
 *
 * Kenapa pakai `MAX_SEQUENCE_DURATION_SEC` (bukan current seqDur):
 * - Drag bisa menyebabkan content extend melebihi `sequence.durationSec`
 *   saat ini (mis. drag clip ke posisi 100s dengan seqDur 60s).
 * - Kalau clamp pakai current duration → clip terpotong ke 60s.
 * - `withAutoAdjust` di akhir akan extend seqDur otomatis ke content end.
 *
 * 1 history entry untuk multi-clip drag (bukan N entries).
 */
export function moveClipsBulk(
  moves: readonly { clipId: string; startSec: number }[],
): void {
  if (moves.length === 0) return;

  appStore.setState((state) => {
    const maxSeq = TIMELINE.MAX_SEQUENCE_DURATION_SEC;
    const byId = new Map(moves.map((m) => [m.clipId, m.startSec] as const));
    let anyChanged = false;

    const nextTracks = state.project.sequence.tracks.map((track) => {
      let trackChanged = false;

      const nextClips = track.clips.map((clip) => {
        const requested = byId.get(clip.id);
        if (requested === undefined) return clip;

        /* Per-clip clamp: [0, MAX_SEQ - duration]. */
        const maxStart = Math.max(0, maxSeq - clip.durationSec);
        const clamped = Math.max(0, Math.min(maxStart, requested));

        /* Tolerance 1ms untuk floating-point (drag delta = px/pxPerSec
           sering menghasilkan 0.0000001 drift). */
        if (Math.abs(clamped - clip.startSec) < 0.001) return clip;

        trackChanged = true;
        return { ...clip, startSec: clamped };
      });

      if (!trackChanged) return track;
      anyChanged = true;
      return { ...track, clips: nextClips };
    });

    if (!anyChanged) return state;

    const nextProject = {
      ...state.project,
      sequence: { ...state.project.sequence, tracks: nextTracks },
    };
    return withAutoAdjust(state, nextProject);
  });
}

export function deleteClip(clipId: string): void {
  appStore.setState((state) => {
    if (
      !state.project.sequence.tracks.some((t) =>
        t.clips.some((c) => c.id === clipId),
      )
    ) {
      return state;
    }

    const nextProject = {
      ...state.project,
      sequence: {
        ...state.project.sequence,
        tracks: state.project.sequence.tracks.map((t) => ({
          ...t,
          clips: t.clips.filter((c) => c.id !== clipId),
          transitions: t.transitions.filter(
            (tr) => tr.beforeClipId !== clipId && tr.afterClipId !== clipId,
          ),
        })),
      },
    };

    const adjusted = withAutoAdjust(state, nextProject); // ← FIX
    return {
      ...adjusted,
      selection: {
        ...state.selection,
        selectedClipIds: state.selection.selectedClipIds.filter(
          (id) => id !== clipId,
        ),
      },
    };
  });
}

export function deleteClipsBulk(ids: readonly string[]): void {
  if (ids.length === 0) return;
  const idSet = new Set(ids);

  appStore.setState((state) => {
    let changed = false;
    const nextTracks = state.project.sequence.tracks.map((track) => {
      const nextClips = track.clips.filter((c) => !idSet.has(c.id));
      const nextTransitions = track.transitions.filter(
        (tr) => !idSet.has(tr.beforeClipId) && !idSet.has(tr.afterClipId),
      );
      if (
        nextClips.length === track.clips.length &&
        nextTransitions.length === track.transitions.length
      )
        return track;
      changed = true;
      return { ...track, clips: nextClips, transitions: nextTransitions };
    });

    if (!changed) return state;

    const nextProject = {
      ...state.project,
      sequence: { ...state.project.sequence, tracks: nextTracks },
    };

    const adjusted = withAutoAdjust(state, nextProject); // ← FIX
    return {
      ...adjusted,
      selection: {
        ...state.selection,
        selectedClipIds: state.selection.selectedClipIds.filter(
          (id) => !idSet.has(id),
        ),
      },
    };
  });
}

export function setClipDuration(clipId: string, newDurationSec: number): void {
  appStore.setState((state) => {
    for (const track of state.project.sequence.tracks) {
      const idx = track.clips.findIndex((c) => c.id === clipId);
      if (idx < 0) continue;
      const clip = track.clips[idx];
      if (!clip) return state;

      const maxDur = getMaxClipDuration(state, clip);
      const clamped = Math.max(0.1, Math.min(maxDur, newDurationSec));
      if (Math.abs(clamped - clip.durationSec) < 0.001) return state;

      const nextClips = [...track.clips];
      nextClips[idx] = { ...clip, durationSec: clamped };
      const nextProject = {
        ...state.project,
        sequence: {
          ...state.project.sequence,
          tracks: state.project.sequence.tracks.map((t) =>
            t.id === track.id ? { ...t, clips: nextClips } : t,
          ),
        },
      };
      return withAutoAdjust(state, nextProject);
    }
    return state;
  });
}

export function splitClip(clipId: string, splitTimeSec: number): void {
  const SPLIT_MIN = 0.1;

  appStore.setState((state) => {
    for (const track of state.project.sequence.tracks) {
      if (track.locked) continue;
      const idx = track.clips.findIndex((c) => c.id === clipId);
      if (idx < 0) continue;
      const clip = track.clips[idx];
      if (!clip) return state;

      const clipEnd = clip.startSec + clip.durationSec;
      if (splitTimeSec <= clip.startSec + SPLIT_MIN) return state;
      if (splitTimeSec >= clipEnd - SPLIT_MIN) return state;

      const leftDur = splitTimeSec - clip.startSec;
      const rightDur = clipEnd - splitTimeSec;
      const newId = makeId("clip");

      const left: Clip = { ...clip, durationSec: leftDur };
      const right: Clip = {
        ...clip,
        id: newId,
        startSec: splitTimeSec,
        durationSec: rightDur,
      };

      const nextClips = [...track.clips];
      nextClips.splice(idx, 1, left, right);
      const nextProject = {
        ...state.project,
        sequence: {
          ...state.project.sequence,
          tracks: state.project.sequence.tracks.map((t) =>
            t.id === track.id ? { ...t, clips: nextClips } : t,
          ),
        },
      };
      // Split doesn't change content end → withProject (bukan autoAdjust)
      // tapi konsisten pakai auto-adjust karena keduanya sama-sama no-op disini.
      return withAutoAdjust(state, nextProject);
    }
    return state;
  });
}
