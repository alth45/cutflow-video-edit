import { appStore } from "@state/appStore";
import { TIMELINE } from "@shared/constants";
import { makeId } from "@utils/id";
import { getSelectedClips } from "@state/selectors";
import {
  setClipboard,
  getClipboard,
  type ClipboardEntry,
} from "@state/clipboard";
import type { AppState } from "@shared/types/state";
import type { Clip, Track } from "@shared/types/timeline";
import { addClipsBulk, deleteClip } from "./clip.actions";
import { selectClip } from "./selection.actions";

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

export function cutSelection(): void {
  copySelection();
  const ids = [...appStore.getState().selection.selectedClipIds];
  for (const id of ids) deleteClip(id);
}

export function pasteAtPlayhead(): void {
  const state = appStore.getState();
  const entries = getClipboard();
  if (entries.length === 0) return;

  const playhead = state.playback.currentTimeSec;

  /* FIX: clamp pakai MAX_SEQUENCE (bukan current duration), supaya
     paste di dekat ujung bisa extend via withAutoAdjust. */
  const maxSeq = TIMELINE.MAX_SEQUENCE_DURATION_SEC;
  const items: Array<{ trackId: string; clip: Clip }> = [];

  for (const entry of entries) {
    const target = resolvePasteTrack(state, entry);
    if (!target) continue;

    const targetStart = playhead + entry.relativeStartSec;
    const maxStart = Math.max(0, maxSeq - entry.clip.durationSec);
    const clampedStart = Math.max(0, Math.min(maxStart, targetStart));
    const roundedStart = Math.round(clampedStart * 10) / 10;

    items.push({
      trackId: target.id,
      clip: cloneWithNewPosition(entry.clip, makeId("clip"), roundedStart),
    });
  }

  if (items.length === 0) return;

  addClipsBulk(items);

  if (items[0]) selectClip(items[0].clip.id);
}

function resolvePasteTrack(
  state: AppState,
  entry: ClipboardEntry,
): Track | null {
  const tracks = state.project.sequence.tracks;

  if (state.selection.activeTrackId) {
    const active = tracks.find((t) => t.id === state.selection.activeTrackId);
    if (active && active.kind === entry.trackKind && !active.locked)
      return active;
  }
  const source = tracks.find((t) => t.id === entry.sourceTrackId);
  if (source && source.kind === entry.trackKind && !source.locked)
    return source;

  return tracks.find((t) => t.kind === entry.trackKind && !t.locked) ?? null;
}

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
    case "shape":
      return { ...clip, ...base };
    case "nested":
      return { ...clip, ...base };
  }
}
