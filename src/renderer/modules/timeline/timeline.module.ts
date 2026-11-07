import { setChildren } from "@core/Dom";
import { appStore } from "@state/appStore";
import { getActiveClip } from "@state/selectors";
import { KEYFRAMEABLE_KEYS } from "@shared/types/timeline";
import type { AppState } from "@shared/types/state";
import {
  renderTimeline,
  renderRulerInto,
  renderTrackHeads,
  renderTracks,
  updatePlayheadState,
  updateSelection,
  updateZoom,
  updateActiveTool,
  type TimelineView,
} from "./timeline.view";
import { attachTimelineController } from "./timeline.controller";

/* ============================================================
   TIMELINE MODULE — ENTRY
   ============================================================ */

export function mountTimeline(container: HTMLElement): () => void {
  const initial = appStore.getState();
  const view = renderTimeline(initial);
  setChildren(container, view.root);

  /* Sync initial UI state (things not covered by renderTimeline itself). */
  updateActiveTool(view, initial);
  syncKeyframeButton(view, initial);

  /* Subscriber — re-render only what changed. */
  const unsubscribe = appStore.subscribe((state, prev) => {
    /* ---- Playhead (every frame during playback) ---- */
    if (state.playback.currentTimeSec !== prev.playback.currentTimeSec) {
      updatePlayheadState(view, state);
    }

    /* ---- Sequence (tracks, clips, duration) ---- */
    if (state.project.sequence !== prev.project.sequence) {
      if (
        state.project.sequence.durationSec !== prev.project.sequence.durationSec
      ) {
        renderRulerInto(view.ruler, state.project.sequence.durationSec);
      }
      renderTracks(view.tracksContainer, state);
      renderTrackHeads(view.trackHeadsContainer, state);
      updatePlayheadState(view, state);
    }

    /* ---- Selection ---- */
    if (state.selection.selectedClipIds !== prev.selection.selectedClipIds) {
      updateSelection(view, state);
    }

    /* ---- UI (zoom / snap / tool) ---- */
    if (state.ui.timeline !== prev.ui.timeline) {
      updateZoom(view, state);
      if (state.ui.timeline.activeTool !== prev.ui.timeline.activeTool) {
        updateActiveTool(view, state);
      }
    }

    /* ---- Keyframe button state ---- */
    const activeClip = getActiveClip(state);
    const prevActiveClip = getActiveClip(prev);
    const playheadMoved =
      state.playback.currentTimeSec !== prev.playback.currentTimeSec;
    const selectionChanged =
      state.selection.selectedClipIds !== prev.selection.selectedClipIds;
    const kfChanged = activeClip?.keyframes !== prevActiveClip?.keyframes;

    if (playheadMoved || selectionChanged || kfChanged) {
      syncKeyframeButton(view, state);
    }
  });

  const detach = attachTimelineController(view);

  return () => {
    detach();
    unsubscribe();
    container.replaceChildren();
  };
}

/* ============================================================
   KEYFRAME BUTTON STATE SYNC
   ------------------------------------------------------------
   kf-none : no clip, or clip has no keyframes
   kf-has  : clip has keyframes (but not at current playhead)
   kf-at   : keyframe exists at playhead (click = remove)
   ============================================================ */

function syncKeyframeButton(view: TimelineView, state: AppState): void {
  const btn = view.keyframeBtn;
  const activeClip = getActiveClip(state);

  btn.classList.remove("kf-none", "kf-has", "kf-at");

  if (!activeClip) {
    btn.disabled = true;
    btn.classList.add("kf-none");
    btn.title = "Select a clip to keyframe";
    return;
  }

  btn.disabled = false;

  const localTime = Math.max(
    0,
    Math.min(
      activeClip.durationSec,
      state.playback.currentTimeSec - activeClip.startSec,
    ),
  );

  const kfs = activeClip.keyframes ?? {};
  let hasAny = false;
  let atPlayhead = false;

  for (const key of KEYFRAMEABLE_KEYS) {
    const arr = kfs[key] ?? [];
    if (arr.length > 0) hasAny = true;
    if (arr.some((kf) => Math.abs(kf.timeSec - localTime) <= 0.05)) {
      atPlayhead = true;
      break;
    }
  }

  if (atPlayhead) {
    btn.classList.add("kf-at");
    btn.title = "Remove keyframe at playhead";
  } else if (hasAny) {
    btn.classList.add("kf-has");
    btn.title = "Add keyframe at playhead";
  } else {
    btn.classList.add("kf-none");
    btn.title = "Add keyframe at playhead (all properties)";
  }
}
