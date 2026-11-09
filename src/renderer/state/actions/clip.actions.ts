import { appStore } from "@state/appStore";
import { TIMELINE } from "@shared/constants";
import { makeId } from "@utils/id";
import {
  getClipById,
  getTrackById,
  getMaxClipDuration,
} from "@state/selectors";
import {
  DEFAULT_CLIP_TRANSFORM,
  DEFAULT_CLIP_COLOR,
  DEFAULT_CLIP_AUDIO,
  DEFAULT_CHROMA_KEY,
  type Clip,
  type Track,
  type NestedClip,
} from "@shared/types/timeline";
import { withAutoAdjust, isClipCompatible } from "./helpers";

/* ============================================================
   CLIP OPERATIONS
   ------------------------------------------------------------
   Tambah / pindah / hapus / trim / split / nest clip.
   Semua mutation via `appStore.setState(updater)` — no direct
   object assignment.
   ============================================================ */

/* ============================================================
   ADD
   ============================================================ */

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
    return withAutoAdjust(state, nextProject);
  });
}

/* ============================================================
   MOVE
   ============================================================ */

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
 * Move multiple clips sekaligus. Controller mengirim `startSec`
 * absolut (initial + delta) — function ini clamp defensif.
 *
 * Clamp pakai `MAX_SEQUENCE_DURATION_SEC` (bukan current seqDur)
 * supaya drag ke posisi extend bisa extend seqDur via withAutoAdjust.
 * 1 history entry untuk seluruh multi-drag.
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

        const maxStart = Math.max(0, maxSeq - clip.durationSec);
        const clamped = Math.max(0, Math.min(maxStart, requested));

        /* Tolerance 1ms — drag delta = px/pxPerSec sering drift. */
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

/* ============================================================
   DELETE
   ============================================================ */

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

    const adjusted = withAutoAdjust(state, nextProject);
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
      ) {
        return track;
      }
      changed = true;
      return { ...track, clips: nextClips, transitions: nextTransitions };
    });

    if (!changed) return state;

    const nextProject = {
      ...state.project,
      sequence: { ...state.project.sequence, tracks: nextTracks },
    };

    const adjusted = withAutoAdjust(state, nextProject);
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

/* ============================================================
   RESIZE / TRIM
   ============================================================ */

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

/* ============================================================
   SPLIT
   ============================================================ */

export function splitClip(clipId: string, splitTimeSec: number): void {
  const SPLIT_MIN = 0.1;

  appStore.setState((state) => {
    for (const track of state.project.sequence.tracks) {
      if (track.locked) continue;
      const idx = track.clips.findIndex((c) => c.id === clipId);
      if (idx < 0) continue;
      const clip = track.clips[idx];
      if (!clip) return state;

      /* Nested clips tidak bisa di-split (inner source tidak track
         sourceOffsetSec per-half). Un-nest dulu kalau perlu split. */
      if (clip.kind === "nested") return state;

      const clipEnd = clip.startSec + clip.durationSec;
      if (splitTimeSec <= clip.startSec + SPLIT_MIN) return state;
      if (splitTimeSec >= clipEnd - SPLIT_MIN) return state;

      const leftDur = splitTimeSec - clip.startSec;
      const rightDur = clipEnd - splitTimeSec;

      const left: Clip = { ...clip, durationSec: leftDur };
      const right: Clip = {
        ...clip,
        id: makeId("clip"),
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
      return withAutoAdjust(state, nextProject);
    }
    return state;
  });
}

/* ============================================================
   NEST / UN-NEST
   ============================================================ */

export type NestResult =
  | { readonly ok: true; readonly clipCount: number }
  | { readonly ok: false; readonly error: string };

/** Clone clip ke coord relative (`startSec - originSec`), assign new ID. */
function toRelativeClips(clips: readonly Clip[], originSec: number): Clip[] {
  return clips.map((c) => ({
    ...c,
    id: makeId("clip"),
    startSec: Math.round((c.startSec - originSec) * 10) / 10,
  }));
}

/**
 * Group 2+ clips pada track video yang sama jadi 1 nested clip.
 * Inner clips stored relative to group start (`minStart`).
 * Transitions di dalam selection di-drop (MVP).
 */
export function nestClips(clipIds: readonly string[]): NestResult {
  if (clipIds.length < 2) {
    return { ok: false, error: "Select at least 2 clips" };
  }

  const state = appStore.getState();
  const idSet = new Set(clipIds);

  /* Single-pass: cari semua clip + track owner. Reject if cross-track. */
  let track: Track | null = null;
  const targetClips: Clip[] = [];

  for (const t of state.project.sequence.tracks) {
    for (const c of t.clips) {
      if (!idSet.has(c.id)) continue;
      if (track && track.id !== t.id) {
        return { ok: false, error: "All clips must be on the same track" };
      }
      if (!track) track = t;
      targetClips.push(c);
    }
  }

  if (!track) return { ok: false, error: "Clips not found" };
  if (targetClips.length < 2) {
    return { ok: false, error: "Select at least 2 clips on the same track" };
  }
  if (track.kind !== "video") {
    return { ok: false, error: "Nest only works on video tracks" };
  }
  if (track.locked) return { ok: false, error: "Track is locked" };
  if (targetClips.some((c) => c.kind === "nested")) {
    return { ok: false, error: "Cannot nest nested clips (un-nest first)" };
  }

  const minStart = Math.min(...targetClips.map((c) => c.startSec));
  const maxEnd = Math.max(
    ...targetClips.map((c) => c.startSec + c.durationSec),
  );
  const totalDur = Math.round((maxEnd - minStart) * 10) / 10;

  const innerTrack: Track = {
    id: makeId("track"),
    kind: "video",
    name: "Nested",
    clips: toRelativeClips(targetClips, minStart),
    transitions: [],
    muted: false,
    locked: false,
    hidden: false,
  };

  const nestedClip: NestedClip = {
    id: makeId("clip"),
    kind: "nested",
    name: `Group (${targetClips.length})`,
    startSec: Math.round(minStart * 10) / 10,
    durationSec: totalDur,
    colorToken: "purple",
    transform: DEFAULT_CLIP_TRANSFORM,
    color: DEFAULT_CLIP_COLOR,
    audio: DEFAULT_CLIP_AUDIO,
    effects: [],
    keyframes: {},
    animation: null,
    chromaKey: DEFAULT_CHROMA_KEY,
    source: {
      kind: "nested",
      tracks: [innerTrack],
      durationSec: totalDur,
    },
  };

  const sourceTrackId = track.id;
  const nestedId = nestedClip.id;

  appStore.setState((prev) => {
    const sourceTrack = prev.project.sequence.tracks.find(
      (t) => t.id === sourceTrackId,
    );
    if (!sourceTrack) return prev;

    const nextClips = sourceTrack.clips.filter((c) => !idSet.has(c.id));
    nextClips.push(nestedClip);

    const nextTracks = prev.project.sequence.tracks.map((t) =>
      t.id === sourceTrackId ? { ...t, clips: nextClips } : t,
    );

    const nextProject = {
      ...prev.project,
      sequence: { ...prev.project.sequence, tracks: nextTracks },
    };

    const adjusted = withAutoAdjust(prev, nextProject);
    return {
      ...adjusted,
      selection: {
        ...prev.selection,
        selectedClipIds: [nestedId],
        selectedTransitionId: null,
      },
    };
  });

  return { ok: true, clipCount: targetClips.length };
}

/**
 * Expand nested clip back ke individual clips di parent track.
 * Source di-drop setelah extraction.
 */
export function unnestClip(nestedClipId: string): NestResult {
  const state = appStore.getState();

  let parentTrack: Track | null = null;
  let nestedClip: Clip | null = null;

  for (const t of state.project.sequence.tracks) {
    const c = t.clips.find((x) => x.id === nestedClipId);
    if (c) {
      parentTrack = t;
      nestedClip = c;
      break;
    }
  }

  if (!parentTrack || !nestedClip) {
    return { ok: false, error: "Nested clip not found" };
  }
  if (nestedClip.kind !== "nested") {
    return { ok: false, error: "Selected clip is not nested" };
  }
  if (parentTrack.locked) {
    return { ok: false, error: "Track is locked" };
  }

  const baseStart = nestedClip.startSec;
  const restoredClips: Clip[] = [];

  for (const innerTrack of nestedClip.source.tracks) {
    for (const innerClip of innerTrack.clips) {
      restoredClips.push({
        ...innerClip,
        id: makeId("clip"),
        startSec: Math.round((baseStart + innerClip.startSec) * 10) / 10,
      });
    }
  }

  if (restoredClips.length === 0) {
    return { ok: false, error: "Nested clip has no inner clips" };
  }

  const parentTrackId = parentTrack.id;
  const restoredIds = restoredClips.map((c) => c.id);

  appStore.setState((prev) => {
    const track = prev.project.sequence.tracks.find(
      (t) => t.id === parentTrackId,
    );
    if (!track) return prev;

    const nextClips = track.clips.filter((c) => c.id !== nestedClipId);
    nextClips.push(...restoredClips);

    const nextTracks = prev.project.sequence.tracks.map((t) =>
      t.id === parentTrackId ? { ...t, clips: nextClips } : t,
    );

    const nextProject = {
      ...prev.project,
      sequence: { ...prev.project.sequence, tracks: nextTracks },
    };

    const adjusted = withAutoAdjust(prev, nextProject);
    return {
      ...adjusted,
      selection: {
        ...prev.selection,
        selectedClipIds: restoredIds,
        selectedTransitionId: null,
      },
    };
  });

  return { ok: true, clipCount: restoredClips.length };
}
