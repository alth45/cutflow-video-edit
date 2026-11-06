import { appStore, createInitialState } from "./appStore";
import {
  getClipById,
  getTrackById,
  getMaxClipDuration,
  getSelectedClips,
} from "./selectors";
import type { Project, MediaAsset } from "@shared/types/project";
import {
  DEFAULT_CLIP_TRANSFORM,
  DEFAULT_CLIP_COLOR,
  DEFAULT_CLIP_AUDIO,
  DEFAULT_TEXT_STYLE,
} from "@shared/types/timeline";
import type {
  Clip,
  TrackKind,
  ClipKind,
  Track,
  TextClip,
  Transition,
  TransitionKind,
  ClipTransform,
  ClipColor,
  ClipAudio,
  TextClipStyle,
  EffectKind,
  ClipEffect,
} from "@shared/types/timeline";
import type {
  AppState,
  MediaPanelTab,
  InspectorPanelTab,
  HistorySnapshot,
} from "@shared/types/state";

import { ZOOM, TIMELINE } from "@shared/constants";
import type { TimelineTool } from "@shared/types/state";
import { makeId } from "@utils/id";
import { setClipboard, getClipboard, type ClipboardEntry } from "./clipboard";
import { createDefaultEffect } from "@modules/effects/effect.logic";

/* ============================================================
   ACTIONS
   ------------------------------------------------------------
   Satu-satunya pintu untuk memutasi `appStore`.

   ATURAN:
   - Modul UI (view/controller) TIDAK BOLEH panggil
     `appStore.setState` langsung. Harus lewat action di sini.
   - Setiap action WAJIB mengembalikan `prev` (state yang sama)
     kalau no-op — supaya Store bisa skip notify.
   - Setiap action yang mengubah `state.project` WAJIB lewat
     `withProject()` → `isDirty` otomatis ter-set.
   - Action murni mutasi state. Tidak ada async, IPC, atau DOM.

   POLA PEMAKAIAN:
     import * as actions from '@state/actions';
     actions.setCurrentTime(12.5);
     actions.selectClip('clip_abc');
   ============================================================ */

/* ============================================================
   INTERNAL HELPERS
   ============================================================ */

const MAX_HISTORY = 100;

/**
 * Bungkus update project dengan `isDirty: true` + push
 * snapshot ke history. WAJIB dipakai setiap kali mengubah
 * `state.project` — satu-satunya tempat history push.
 */
function withProject(state: AppState, next: Project): AppState {
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
    history: { past, future: [] }, // ← edit baru clear redo stack
  };
}

/**
 * End position (detik) terjauh dari semua clips di semua tracks.
 * 0 kalau kosong.
 */
function computeContentEnd(tracks: readonly Track[]): number {
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
 * Kalau content end > current duration, extend sequence duration
 * ke content end (round up ke 0.1s). Cap di MAX_SEQUENCE_DURATION_SEC.
 * Tidak shrink — kalau content < duration, biarkan (user masih bisa
 * extend manual nanti).
 */
function withAutoExtend(project: Project): Project {
  const contentEnd = computeContentEnd(project.sequence.tracks);
  const current = project.sequence.durationSec;
  if (contentEnd <= current) return project;

  const capped = Math.min(contentEnd, TIMELINE.MAX_SEQUENCE_DURATION_SEC);
  const rounded = Math.ceil(capped * 10) / 10;

  if (rounded <= current) return project;
  return {
    ...project,
    sequence: { ...project.sequence, durationSec: rounded },
  };
}

/**
 * Validasi kompatibilitas jenis clip dengan track.
 * - Audio track hanya menerima AudioClip.
 * - Video track menerima VideoClip atau TextClip.
 */
function isClipCompatible(trackKind: TrackKind, clipKind: ClipKind): boolean {
  if (trackKind === "audio") return clipKind === "audio";
  return clipKind === "video" || clipKind === "text";
}

/* ============================================================
   PROJECT
   ============================================================ */

/** Reset ke project default (kosong). Semua state UI ikut reset. */
export function newProject(): void {
  appStore.setState(() => createInitialState());
}

/**
 * Load project dari file. **Tidak** men-set `isDirty` (state = file).
 * Selection di-reset (clip lama tidak exist di project baru).
 * Playback di-reset ke 0.
 * UI state (zoom, tab, dll) dipertahankan — user preference.
 */
export function loadProject(project: Project): void {
  appStore.setState((state) => ({
    ...state,
    project,
    isDirty: false,
    history: { past: [], future: [] },
    playback: { playing: false, currentTimeSec: 0 },
    selection: {
      selectedClipIds: [],
      activeTrackId: null,
      selectedTransitionId: null,
    },
  }));
}

/** Ganti nama project. No-op kalau nama kosong atau tidak berubah. */
export function renameProject(name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;

  appStore.setState((state) => {
    if (state.project.name === trimmed) return state;
    return withProject(state, { ...state.project, name: trimmed });
  });
}

/**
 * Tandai project sudah tersimpan (di panggil setelah save sukses).
 * Update `updatedAt` (metadata waktu), clear `isDirty`.
 */
export function markSaved(updatedAt: number): void {
  appStore.setState((state) => ({
    ...state,
    project: { ...state.project, updatedAt },
    isDirty: false,
  }));
}

/* ============================================================
   UNDO / REDO
   ------------------------------------------------------------
   Snapshot-based. Reference-safe karena project frozen.
   Undo/redo TIDAK push history (langsung manipulate past/future).
   ============================================================ */

export function undo(): void {
  appStore.setState((state) => {
    const past = state.history.past;
    if (past.length === 0) return state;

    const previous = past[past.length - 1]!;
    const snapshot: HistorySnapshot = {
      project: state.project,
      isDirty: state.isDirty,
    };

    return {
      ...state,
      project: previous.project,
      isDirty: previous.isDirty,
      history: {
        past: past.slice(0, -1),
        future: [snapshot, ...state.history.future],
      },
    };
  });
}

export function redo(): void {
  appStore.setState((state) => {
    const future = state.history.future;
    if (future.length === 0) return state;

    const next = future[0]!;
    const snapshot: HistorySnapshot = {
      project: state.project,
      isDirty: state.isDirty,
    };

    return {
      ...state,
      project: next.project,
      isDirty: next.isDirty,
      history: {
        past: [...state.history.past, snapshot],
        future: future.slice(1),
      },
    };
  });
}

export function canUndo(state: AppState): boolean {
  return state.history.past.length > 0;
}

export function canRedo(state: AppState): boolean {
  return state.history.future.length > 0;
}

/* ============================================================
   PLAYBACK
   ============================================================ */

/**
 * Toggle play/pause. Kalau play dari akhir timeline,
 * restart dari 0 (standar editor video).
 */
export function togglePlay(): void {
  appStore.setState((state) => {
    if (state.playback.playing) {
      return { ...state, playback: { ...state.playback, playing: false } };
    }

    const duration = state.project.sequence.durationSec;
    const frameSec = 1 / state.project.sequence.fps;
    const atEnd = state.playback.currentTimeSec >= duration - frameSec;
    const startFrom = atEnd ? 0 : state.playback.currentTimeSec;

    return { ...state, playback: { playing: true, currentTimeSec: startFrom } };
  });
}

/** Set status playing secara eksplisit (dipakai auto-pause di akhir). */
export function setPlaying(playing: boolean): void {
  appStore.setState((state) => {
    if (state.playback.playing === playing) return state;
    return { ...state, playback: { ...state.playback, playing } };
  });
}

/** Set posisi playhead (clamp ke [0, duration]). No-op kalau sama. */
export function setCurrentTime(sec: number): void {
  appStore.setState((state) => {
    const duration = state.project.sequence.durationSec;
    const clamped = Math.max(0, Math.min(duration, sec));
    if (clamped === state.playback.currentTimeSec) return state;
    return {
      ...state,
      playback: { ...state.playback, currentTimeSec: clamped },
    };
  });
}

/** Step playhead 1 frame ke depan (`+1`) atau ke belakang (`-1`). */
export function stepFrame(delta: 1 | -1): void {
  appStore.setState((state) => {
    const frameSec = 1 / state.project.sequence.fps;
    const duration = state.project.sequence.durationSec;
    const next = Math.max(
      0,
      Math.min(duration, state.playback.currentTimeSec + delta * frameSec),
    );
    if (next === state.playback.currentTimeSec) return state;
    return { ...state, playback: { ...state.playback, currentTimeSec: next } };
  });
}

/** Pindahkan playhead ke awal timeline. */
export function goToStart(): void {
  setCurrentTime(0);
}

/** Pindahkan playhead ke akhir timeline. */
export function goToEnd(): void {
  appStore.setState((state) => {
    const duration = state.project.sequence.durationSec;
    return {
      ...state,
      playback: { ...state.playback, currentTimeSec: duration },
    };
  });
}

/* ============================================================
   SELECTION
   ============================================================ */

/** Select satu clip (menggantikan selection sebelumnya). */
export function selectClip(clipId: string): void {
  appStore.setState((state) => {
    const isSame =
      state.selection.selectedClipIds.length === 1 &&
      state.selection.selectedClipIds[0] === clipId &&
      state.selection.selectedTransitionId === null;
    if (isSame) return state;

    return {
      ...state,
      selection: {
        ...state.selection,
        selectedClipIds: [clipId],
        selectedTransitionId: null,
      },
    };
  });
}

/** Toggle clip di selection (Ctrl+click / Shift+click pattern). */
export function toggleClipSelection(clipId: string): void {
  appStore.setState((state) => {
    const ids = state.selection.selectedClipIds;
    const next = ids.includes(clipId)
      ? ids.filter((id) => id !== clipId)
      : [...ids, clipId];
    return {
      ...state,
      selection: { ...state.selection, selectedClipIds: next },
    };
  });
}

/** Kosongkan selection. */
export function clearSelection(): void {
  appStore.setState((state) => {
    if (
      state.selection.selectedClipIds.length === 0 &&
      state.selection.selectedTransitionId === null
    )
      return state;
    return {
      ...state,
      selection: {
        ...state.selection,
        selectedClipIds: [],
        selectedTransitionId: null,
      },
    };
  });
}

/** Set track aktif (target drop). Pass `null` untuk clear. */
export function setActiveTrack(trackId: string | null): void {
  appStore.setState((state) => {
    if (state.selection.activeTrackId === trackId) return state;
    return {
      ...state,
      selection: { ...state.selection, activeTrackId: trackId },
    };
  });
}

/* ============================================================
   TRANSITIONS
   ------------------------------------------------------------
   Placeholder untuk future transition animation. Data saja —
   rendering & interaksi di timeline module.
   ============================================================ */

const DEFAULT_TRANSITION_DURATION_SEC = 0.5;

/** Buat transition baru di junction `beforeClipId` ↔ `afterClipId`. */
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

    /* Validasi clip exist & adjacent. */
    const before = track.clips.find((c) => c.id === beforeClipId);
    const after = track.clips.find((c) => c.id === afterClipId);
    if (!before || !after) return state;

    const junction = before.startSec + before.durationSec;
    if (Math.abs(junction - after.startSec) > 0.05) return state;

    /* Cegah duplikat. */
    if (
      track.transitions.some(
        (t) => t.beforeClipId === beforeClipId && t.afterClipId === afterClipId,
      )
    ) {
      return state;
    }

    /* Clamp durasi: tidak melebihi durasi salah satu clip. */
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

/**
 * Ubah jenis transition. 1 history entry. Visual di preview
 * otomatis reflect via `getTransitionSample` (F14w/F14x).
 */
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

/** Hapus transition berdasarkan ID (cari track-nya). */
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

/** Select transition — clear clip selection (mutual exclusion). */
export function selectTransition(transitionId: string): void {
  appStore.setState((state) => {
    if (state.selection.selectedTransitionId === transitionId) return state;
    return {
      ...state,
      selection: {
        ...state.selection,
        selectedTransitionId: transitionId,
        selectedClipIds: [],
      },
    };
  });
}

/* ============================================================
   UI — MEDIA PANEL
   ============================================================ */

export function setMediaTab(tab: MediaPanelTab): void {
  appStore.setState((state) => {
    if (state.ui.media.activeTab === tab) return state;
    return {
      ...state,
      ui: { ...state.ui, media: { ...state.ui.media, activeTab: tab } },
    };
  });
}

export function setSearchQuery(query: string): void {
  appStore.setState((state) => {
    if (state.ui.media.searchQuery === query) return state;
    return {
      ...state,
      ui: { ...state.ui, media: { ...state.ui.media, searchQuery: query } },
    };
  });
}

/* ============================================================
   UI — INSPECTOR
   ============================================================ */

export function setInspectorTab(tab: InspectorPanelTab): void {
  appStore.setState((state) => {
    if (state.ui.inspector.activeTab === tab) return state;
    return {
      ...state,
      ui: { ...state.ui, inspector: { ...state.ui.inspector, activeTab: tab } },
    };
  });
}

/** Toggle group accordion (transform, crop, speed, ...). */
export function toggleInspectorGroup(groupId: string): void {
  appStore.setState((state) => {
    const groups = state.ui.inspector.collapsedGroups;
    const next = groups.includes(groupId)
      ? groups.filter((id) => id !== groupId)
      : [...groups, groupId];
    return {
      ...state,
      ui: {
        ...state.ui,
        inspector: { ...state.ui.inspector, collapsedGroups: next },
      },
    };
  });
}

/* ============================================================
   UI — TIMELINE
   ============================================================ */

/** Set zoom horizontal (clamp ke ZOOM.MIN..ZOOM.MAX). */
export function setZoom(zoom: number): void {
  appStore.setState((state) => {
    const clamped = Math.max(ZOOM.MIN, Math.min(ZOOM.MAX, zoom));
    if (clamped === state.ui.timeline.zoom) return state;
    return {
      ...state,
      ui: { ...state.ui, timeline: { ...state.ui.timeline, zoom: clamped } },
    };
  });
}

export function setActiveTool(tool: TimelineTool): void {
  appStore.setState((state) => {
    if (state.ui.timeline.activeTool === tool) return state;
    return {
      ...state,
      ui: {
        ...state.ui,
        timeline: { ...state.ui.timeline, activeTool: tool },
      },
    };
  });
}

/** Toggle snapping (magnet) on/off. */
export function toggleSnap(): void {
  appStore.setState((state) => ({
    ...state,
    ui: {
      ...state.ui,
      timeline: {
        ...state.ui.timeline,
        snapEnabled: !state.ui.timeline.snapEnabled,
      },
    },
  }));
}

/* ============================================================
   LAYOUT (F14v)
   ------------------------------------------------------------
   Toggle visibility panel + fullscreen preview.
   ============================================================ */

export function toggleLayoutPanel(
  panel: "media" | "inspector" | "timeline",
): void {
  appStore.setState((state) => {
    const key = `${panel}Hidden` as
      | "mediaHidden"
      | "inspectorHidden"
      | "timelineHidden";
    return {
      ...state,
      ui: {
        ...state.ui,
        layout: { ...state.ui.layout, [key]: !state.ui.layout[key] },
      },
    };
  });
}

export function togglePreviewFullscreen(): void {
  appStore.setState((state) => ({
    ...state,
    ui: {
      ...state.ui,
      layout: {
        ...state.ui.layout,
        previewFullscreen: !state.ui.layout.previewFullscreen,
      },
    },
  }));
}

/** Tambah track baru. Video track di atas (index 0), audio di bawah. */
export function addTrack(kind: TrackKind): void {
  appStore.setState((state) => {
    const tracks = state.project.sequence.tracks;
    const prefix = kind === "video" ? "V" : "A";

    /* Cari nomor tertinggi untuk prefix ini. */
    let maxNum = 0;
    for (const t of tracks) {
      if (t.kind !== kind) continue;
      const m = t.name.match(/^[VA](\d+)$/);
      if (m) {
        const n = parseInt(m[1]!, 10);
        if (Number.isFinite(n) && n > maxNum) maxNum = n;
      }
    }

    const newTrack: Track = {
      id: makeId("track"),
      kind,
      name: `${prefix}${maxNum + 1}`,
      clips: [],
      transitions: [],
      muted: false,
      locked: false,
      hidden: false,
    };

    const nextTracks =
      kind === "video"
        ? [newTrack, ...tracks] // video di atas
        : [...tracks, newTrack]; // audio di bawah

    const nextProject = {
      ...state.project,
      sequence: { ...state.project.sequence, tracks: nextTracks },
    };
    return withProject(state, nextProject);
  });
}

/* ============================================================
   CLIP OPERATIONS
   ------------------------------------------------------------
   Dipakai oleh timeline controller (F11). Tetap di sini
   karena mutasi project → harus lewat pintu tunggal.
   ============================================================ */

/**
 * Tambah clip ke track. No-op kalau:
 * - Track tidak ada.
 * - Jenis clip tidak kompatibel dengan jenis track.
 * - Clip ID sudah ada (duplikat).
 * - Duration <= 0.
 */
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
    return withProject(state, withAutoExtend(nextProject));
  });
}

/**
 * Replace selection dengan array ID. Dedupe & filter yang tidak
 * exist (defensive — caller bisa kirim ID stale dari snapshot).
 */
export function setSelectedClips(ids: readonly string[]): void {
  appStore.setState((state) => {
    if (ids.length === 0) {
      if (
        state.selection.selectedClipIds.length === 0 &&
        state.selection.selectedTransitionId === null
      )
        return state;
      return {
        ...state,
        selection: {
          ...state.selection,
          selectedClipIds: [],
          selectedTransitionId: null,
        },
      };
    }

    const validIds = new Set<string>();
    for (const track of state.project.sequence.tracks) {
      for (const clip of track.clips) {
        if (ids.includes(clip.id)) validIds.add(clip.id);
      }
    }

    const next = Array.from(validIds);
    const prev = state.selection.selectedClipIds;

    /* No-op jika set identik. */
    if (next.length === prev.length && next.every((id) => prev.includes(id))) {
      return state;
    }

    return {
      ...state,
      selection: {
        ...state.selection,
        selectedClipIds: next,
        selectedTransitionId: null,
      },
    };
  });
}

/**
 * Hapus multiple clip sekaligus. 1 history entry → 1 undo
 * untuk semua. Skip ID yang tidak exist (defensive).
 */
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

    return {
      ...withProject(state, nextProject),
      selection: {
        ...state.selection,
        selectedClipIds: state.selection.selectedClipIds.filter(
          (id) => !idSet.has(id),
        ),
      },
    };
  });
}
/**
 * Pindahkan clip ke `newStartSec` (clamp di [0, duration - clipDur]).
 * No-op kalau tidak berubah.
 */
export function moveClip(clipId: string, newStartSec: number): void {
  appStore.setState((state) => {
    const duration = state.project.sequence.durationSec;

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
      return withProject(state, withAutoExtend(nextProject));
    }
    return state;
  });
}

/**
 * Pindahkan banyak clip sekaligus. 1 history entry → 1 undo
 * untuk semua. Skip ID yang tidak exist / sudah di posisi sama.
 * Clamp per-clip (defensive — bounds sudah dihitung di controller).
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
    return withProject(state, withAutoExtend(nextProject));
  });
}
/**
 * Hapus clip dari track manapun. Cleanup selection jika
 * clip yang dihapus sedang ter-select.
 */
export function deleteClip(clipId: string): void {
  appStore.setState((state) => {
    const exists = state.project.sequence.tracks.some((t) =>
      t.clips.some((c) => c.id === clipId),
    );
    if (!exists) return state;

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

    return {
      ...withProject(state, nextProject),
      selection: {
        ...state.selection,
        selectedClipIds: state.selection.selectedClipIds.filter(
          (id) => id !== clipId,
        ),
      },
    };
  });
}

/* ============================================================
   CLIP EFFECTS (F14aa)
   ------------------------------------------------------------
   Add / toggle / remove effect pada clip.
   - Add: kalau effect kind sudah ada → toggle enabled.
   - Remove: hapus dari array.
   ============================================================ */

export function addEffectToClip(clipId: string, kind: EffectKind): void {
  appStore.setState((state) => {
    for (const track of state.project.sequence.tracks) {
      if (track.locked) continue;

      const idx = track.clips.findIndex((c) => c.id === clipId);
      if (idx < 0) continue;

      const clip = track.clips[idx];
      if (!clip) return state;

      const effects = clip.effects ?? [];
      const existing = effects.find((e) => e.kind === kind);

      let nextEffects: readonly ClipEffect[];

      if (existing) {
        /* Toggle enabled. */
        nextEffects = effects.map((e) =>
          e.id === existing.id ? { ...e, enabled: !e.enabled } : e,
        );
      } else {
        const newEffect = createDefaultEffect(kind);
        if (!newEffect) return state;
        nextEffects = [...effects, newEffect];
      }

      const nextClip: Clip = { ...clip, effects: nextEffects };
      const nextClips = [...track.clips];
      nextClips[idx] = nextClip;

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

export function removeEffectFromClip(clipId: string, effectId: string): void {
  appStore.setState((state) => {
    for (const track of state.project.sequence.tracks) {
      if (track.locked) continue;

      const idx = track.clips.findIndex((c) => c.id === clipId);
      if (idx < 0) continue;

      const clip = track.clips[idx];
      if (!clip) return state;

      const effects = clip.effects ?? [];
      if (!effects.some((e) => e.id === effectId)) return state;

      const nextEffects = effects.filter((e) => e.id !== effectId);
      const nextClip: Clip = { ...clip, effects: nextEffects };
      const nextClips = [...track.clips];
      nextClips[idx] = nextClip;

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

/* ============================================================
   CLIPBOARD OPERATIONS
   ------------------------------------------------------------
   Copy / cut / paste untuk clip. Internal clipboard (module
   storage, tidak masuk state tree) — ephemeral, hilang saat
   restart.
   ============================================================ */

/**
 * Copy clip ter-selected ke clipboard.
 *
 * Untuk multi-select (future): simpan semua clip dengan
 * `relativeStartSec` relatif terhadap clip terawal —
 * preserves timing saat paste.
 */
export function copySelection(): void {
  const state = appStore.getState();
  const clips = getSelectedClips(state);
  if (clips.length === 0) return;

  const earliest = Math.min(...clips.map((c) => c.startSec));
  const built: ClipboardEntry[] = [];

  for (const clip of clips) {
    const track = state.project.sequence.tracks.find((t) =>
      t.clips.some((c) => c.id === clip.id),
    );
    if (!track) continue;

    built.push({
      clip,
      trackKind: track.kind,
      sourceTrackId: track.id,
      relativeStartSec: clip.startSec - earliest,
    });
  }

  if (built.length === 0) return;
  setClipboard(built);
}

/** Cut = copy + delete. */
export function cutSelection(): void {
  copySelection();
  const ids = [...appStore.getState().selection.selectedClipIds];
  for (const id of ids) deleteClip(id);
}

/**
 * Paste clipboard di playhead. Track resolution per-entry:
 *   1. Active track (kalau kind compatible & tidak locked)
 *   2. Source track (kalau ada & compatible & tidak locked)
 *   3. Track compatible pertama (tidak locked)
 *
 * Clips di-paste dengan `startSec = playhead + relativeStartSec`,
 * di-clamp ke `[0, sequence.durationSec - clip.durationSec]`.
 */
export function pasteAtPlayhead(): void {
  const state = appStore.getState();
  const entries = getClipboard();
  if (entries.length === 0) return;

  const playhead = state.playback.currentTimeSec;
  const durationSec = state.project.sequence.durationSec;

  const items: Array<{ trackId: string; clip: Clip }> = [];

  for (const entry of entries) {
    const target = resolvePasteTrack(state, entry);
    if (!target) continue;

    const targetStart = playhead + entry.relativeStartSec;
    const maxStart = Math.max(0, durationSec - entry.clip.durationSec);
    const clampedStart = Math.max(0, Math.min(maxStart, targetStart));
    const roundedStart = Math.round(clampedStart * 10) / 10;

    items.push({
      trackId: target.id,
      clip: cloneWithNewPosition(entry.clip, makeId("clip"), roundedStart),
    });
  }

  if (items.length === 0) return;

  addClipsBulk(items);

  /* Select clip ter-paste (kalau single) — feedback visual. */
  if (items.length === 1 && items[0]) {
    selectClip(items[0].clip.id);
  } else if (items.length > 1) {
    const first = items[0];
    if (first) selectClip(first.clip.id);
  }
}

/* ============================================================
   CLIPBOARD HELPERS (internal)
   ============================================================ */

function resolvePasteTrack(
  state: AppState,
  entry: ClipboardEntry,
): Track | null {
  const tracks = state.project.sequence.tracks;

  /* 1. Active track */
  if (state.selection.activeTrackId) {
    const active = tracks.find((t) => t.id === state.selection.activeTrackId);
    if (active && active.kind === entry.trackKind && !active.locked) {
      return active;
    }
  }

  /* 2. Source track (same id) */
  const source = tracks.find((t) => t.id === entry.sourceTrackId);
  if (source && source.kind === entry.trackKind && !source.locked) {
    return source;
  }

  /* 3. First compatible */
  return tracks.find((t) => t.kind === entry.trackKind && !t.locked) ?? null;
}

/** Clone clip dengan id & startSec baru (narrow by kind untuk type safety). */
function cloneWithNewPosition(
  clip: Clip,
  newId: string,
  newStart: number,
): Clip {
  const base = { id: newId, startSec: newStart };
  switch (clip.kind) {
    case "video":
      return { ...clip, ...base };
    case "audio":
      return { ...clip, ...base };
    case "text":
      return { ...clip, ...base };
  }
}

/**
 * Tambah banyak clip sekaligus (1 history entry — supaya
 * multi-paste bisa di-undo dengan satu Ctrl+Z).
 * Skip clip di track locked atau kind incompatible.
 */
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

      const idExists = tracks.some((t) =>
        t.clips.some((c) => c.id === clip.id),
      );
      if (idExists) continue;

      tracks[idx] = { ...track, clips: [...track.clips, clip] };
      changed = true;
    }

    if (!changed) return state;

    return withProject(
      state,
      withAutoExtend({
        ...state.project,
        sequence: { ...state.project.sequence, tracks },
      }),
    );
  });
}

/**
 * Ubah durasi clip (trim). Clamp oleh `getMaxClipDuration` —
 * video/audio dibatasi durasi sumber, image hanya sequence.
 * Gunakan `prev` (no-op) jika hasil clamp = durasi saat ini.
 */
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
      return withProject(state, withAutoExtend(nextProject));
    }
    return state;
  });
}

/* ============================================================
   CLIP TRANSFORM
   ------------------------------------------------------------
   Update properti transform (position, scale, rotation, opacity,
   crop) pada clip. Setiap perubahan = 1 history entry.
   ============================================================ */

export function setClipTransformProperty<K extends keyof ClipTransform>(
  clipId: string,
  key: K,
  value: ClipTransform[K],
): void {
  appStore.setState((state) => {
    for (const track of state.project.sequence.tracks) {
      if (track.locked) continue;

      const idx = track.clips.findIndex((c) => c.id === clipId);
      if (idx < 0) continue;

      const clip = track.clips[idx];
      if (!clip) return state;

      const currentTransform = clip.transform ?? DEFAULT_CLIP_TRANSFORM;
      if (currentTransform[key] === value) return state;

      const nextClip: Clip = {
        ...clip,
        transform: { ...currentTransform, [key]: value },
      };

      const nextClips = [...track.clips];
      nextClips[idx] = nextClip;

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

/**
 * Update multiple transform keys sekaligus (single history entry).
 * Dipakai oleh preview drag (commit pada mouseup).
 */
export function setClipTransformBulk(
  clipId: string,
  updates: Partial<ClipTransform>,
): void {
  appStore.setState((state) => {
    for (const track of state.project.sequence.tracks) {
      if (track.locked) continue;

      const idx = track.clips.findIndex((c) => c.id === clipId);
      if (idx < 0) continue;

      const clip = track.clips[idx];
      if (!clip) return state;

      const current = clip.transform ?? DEFAULT_CLIP_TRANSFORM;
      const next = { ...current };
      let changed = false;

      const keys = Object.keys(updates) as Array<keyof ClipTransform>;
      for (const key of keys) {
        const value = updates[key];
        if (value !== undefined && current[key] !== value) {
          (next as Record<keyof ClipTransform, unknown>)[key] = value;
          changed = true;
        }
      }
      if (!changed) return state;

      const nextClip: Clip = { ...clip, transform: next };
      const nextClips = [...track.clips];
      nextClips[idx] = nextClip;

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
/* ============================================================
   CLIP COLOR
   ------------------------------------------------------------
   Update color correction (exposure, contrast, saturation, temp).
   Setiap perubahan = 1 history entry (granular — sama seperti
   transform slider, bisa di-fix nanti dengan drag grouping).
   ============================================================ */

export function setClipColorProperty<K extends keyof ClipColor>(
  clipId: string,
  key: K,
  value: ClipColor[K],
): void {
  appStore.setState((state) => {
    for (const track of state.project.sequence.tracks) {
      if (track.locked) continue;

      const idx = track.clips.findIndex((c) => c.id === clipId);
      if (idx < 0) continue;

      const clip = track.clips[idx];
      if (!clip) return state;

      const current = clip.color ?? DEFAULT_CLIP_COLOR;
      if (current[key] === value) return state;

      const nextClip: Clip = {
        ...clip,
        color: { ...current, [key]: value },
      };

      const nextClips = [...track.clips];
      nextClips[idx] = nextClip;

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

/* ============================================================
   CLIP AUDIO
   ------------------------------------------------------------
   Update audio properties (volume, fade). 1 history entry per
   update (granular, sama seperti transform & color).
   ============================================================ */

export function setClipAudioProperty<K extends keyof ClipAudio>(
  clipId: string,
  key: K,
  value: ClipAudio[K],
): void {
  appStore.setState((state) => {
    for (const track of state.project.sequence.tracks) {
      if (track.locked) continue;

      const idx = track.clips.findIndex((c) => c.id === clipId);
      if (idx < 0) continue;

      const clip = track.clips[idx];
      if (!clip) return state;

      const current = clip.audio ?? DEFAULT_CLIP_AUDIO;
      if (current[key] === value) return state;

      const nextClip: Clip = {
        ...clip,
        audio: { ...current, [key]: value },
      };

      const nextClips = [...track.clips];
      nextClips[idx] = nextClip;

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
/* ============================================================
   SPLIT CLIP
   ------------------------------------------------------------
   Belah clip di `splitTimeSec` menjadi dua clip baru:
   - Kiri: id & posisi asli, durasi = splitTime - startSec
   - Kanan: id baru, startSec = splitTime, durasi = sisa

   Guard:
   - Split harus strictly inside clip (bukan di edge).
   - Kedua half ≥ 0.1s.
   - Track tidak locked.
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

      const clipEnd = clip.startSec + clip.durationSec;
      if (splitTimeSec <= clip.startSec + SPLIT_MIN) return state;
      if (splitTimeSec >= clipEnd - SPLIT_MIN) return state;

      const leftDur = splitTimeSec - clip.startSec;
      const rightDur = clipEnd - splitTimeSec;
      const newId = makeId("clip");

      let left: Clip;
      let right: Clip;

      switch (clip.kind) {
        case "text":
          left = { ...clip, durationSec: leftDur };
          right = {
            ...clip,
            id: newId,
            startSec: splitTimeSec,
            durationSec: rightDur,
          };
          break;
        case "audio":
          left = { ...clip, durationSec: leftDur };
          right = {
            ...clip,
            id: newId,
            startSec: splitTimeSec,
            durationSec: rightDur,
          };
          break;
        case "video":
          left = { ...clip, durationSec: leftDur };
          right = {
            ...clip,
            id: newId,
            startSec: splitTimeSec,
            durationSec: rightDur,
          };
          break;
      }

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

      /* Selection: karena left half pakai id yang sama, user
         yang select clip sebelumnya otomatis tetap "select"
         left half. Right half tidak otomatis selected. */
      return withProject(state, nextProject);
    }
    return state;
  });
}

/* ============================================================
   MEDIA ASSETS
   ------------------------------------------------------------
   Bulk add = 1 history entry, dan dedupe by id + path (termasuk
   terhadap item di batch yang sama).
   ============================================================ */

export function addMediaAssetsBulk(assets: readonly MediaAsset[]): void {
  if (assets.length === 0) return;

  appStore.setState((state) => {
    const seenIds = new Set(state.project.mediaAssets.map((a) => a.id));
    const seenPaths = new Set(state.project.mediaAssets.map((a) => a.path));

    const filtered: MediaAsset[] = [];
    for (const asset of assets) {
      if (seenIds.has(asset.id) || seenPaths.has(asset.path)) continue;
      seenIds.add(asset.id);
      seenPaths.add(asset.path);
      filtered.push(asset);
    }
    if (filtered.length === 0) return state;

    return withProject(state, {
      ...state.project,
      mediaAssets: [...state.project.mediaAssets, ...filtered],
    });
  });
}

/** Convenience single-asset wrapper (1 history entry). */
export function addMediaAsset(asset: MediaAsset): void {
  addMediaAssetsBulk([asset]);
}

/* ============================================================
   TRACK TOGGLES
   ------------------------------------------------------------
   Dipakai oleh track header buttons (eye / lock) di timeline
   module (F11). Eye toggle `hidden`, lock toggle `locked`.
   `muted` disiapkan untuk fitur mute audio (fase lanjut).
   ============================================================ */

function updateTrackById(
  state: AppState,
  trackId: string,
  updater: (track: Track) => Track,
): AppState {
  const exists = state.project.sequence.tracks.some((t) => t.id === trackId);
  if (!exists) return state;
  const next = {
    ...state.project,
    sequence: {
      ...state.project.sequence,
      tracks: state.project.sequence.tracks.map((t) =>
        t.id === trackId ? updater(t) : t,
      ),
    },
  };
  return withProject(state, next);
}

export function toggleTrackHidden(trackId: string): void {
  appStore.setState((s) =>
    updateTrackById(s, trackId, (t) => ({ ...t, hidden: !t.hidden })),
  );
}

export function toggleTrackLocked(trackId: string): void {
  appStore.setState((s) =>
    updateTrackById(s, trackId, (t) => ({ ...t, locked: !t.locked })),
  );
}

export function toggleTrackMuted(trackId: string): void {
  appStore.setState((s) =>
    updateTrackById(s, trackId, (t) => ({ ...t, muted: !t.muted })),
  );
}

/* ============================================================
   TEXT CLIP CREATION
   ------------------------------------------------------------
   Buat text clip baru (default name/content "Text", color purple,
   durasi 5s). Track harus video. Setelah create, clip auto-
   selected. Auto-extend sequence kalau perlu.
   ============================================================ */

const DEFAULT_TEXT_CLIP_DURATION_SEC = 5;

export function addTextClip(trackId: string, startSec: number): void {
  appStore.setState((state) => {
    const track = getTrackById(state, trackId);
    if (!track || track.locked) return state;
    if (track.kind !== "video") return state;

    const MAX = TIMELINE.MAX_SEQUENCE_DURATION_SEC;
    const duration = DEFAULT_TEXT_CLIP_DURATION_SEC;
    const maxStart = Math.max(0, MAX - duration);
    const clampedStart = Math.max(0, Math.min(maxStart, startSec));

    const textClip: TextClip = {
      id: makeId("clip"),
      kind: "text",
      name: "Text",
      startSec: Math.round(clampedStart * 10) / 10,
      durationSec: duration,
      colorToken: "purple",
      transform: DEFAULT_CLIP_TRANSFORM,
      color: DEFAULT_CLIP_COLOR,
      audio: DEFAULT_CLIP_AUDIO,
      effects: [],
      source: { kind: "text", content: "Text", style: DEFAULT_TEXT_STYLE },
    };

    const nextTrack = { ...track, clips: [...track.clips, textClip] };
    const nextProject = {
      ...state.project,
      sequence: {
        ...state.project.sequence,
        tracks: state.project.sequence.tracks.map((t) =>
          t.id === trackId ? nextTrack : t,
        ),
      },
    };

    return {
      ...withProject(state, withAutoExtend(nextProject)),
      selection: {
        ...state.selection,
        selectedClipIds: [textClip.id],
        selectedTransitionId: null,
      },
    };
  });
}

/**
 * Update konten text clip. `name` di-sync ke content (single-line,
 * truncated 80 char untuk display label) — `source.content` tetap
 * preserve newlines/multi-line.
 *
 * Reject empty content (caller harus handle — user bisa cancel
 * atau hapus clip via Delete kalau mau kosong).
 */
export function updateTextClip(
  clipId: string,
  content: string,
  style: TextClipStyle,
): void {
  const trimmed = content.trim();
  if (!trimmed) return;

  appStore.setState((state) => {
    for (const track of state.project.sequence.tracks) {
      if (track.locked) continue;

      const idx = track.clips.findIndex((c) => c.id === clipId);
      if (idx < 0) continue;

      const clip = track.clips[idx];
      if (!clip || clip.kind !== "text") return state;

      const prevStyle = clip.source.style ?? DEFAULT_TEXT_STYLE;
      const styleChanged = JSON.stringify(prevStyle) !== JSON.stringify(style);
      const contentChanged = clip.source.content !== trimmed;
      if (!contentChanged && !styleChanged) return state;

      const displayName = trimmed.replace(/\s+/g, " ").slice(0, 80) || "Text";

      const nextClip: TextClip = {
        ...clip,
        name: displayName,
        source: { kind: "text", content: trimmed, style },
      };

      const nextClips = [...track.clips];
      nextClips[idx] = nextClip;

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
