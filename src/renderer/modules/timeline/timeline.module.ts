import { setChildren } from "@core/Dom";
import { appStore } from "@state/appStore";
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
  updateActiveTool(view, initial);

  /* Subscriber — re-render bagian yang berubah */
  const unsubscribe = appStore.subscribe((state, prev) => {
    /* Playhead — update setiap frame selama playing. */
    if (state.playback.currentTimeSec !== prev.playback.currentTimeSec) {
      updatePlayheadState(view, state);
    }

    /* Sequence berubah → re-render semua yang terkait durasi */
    if (state.project.sequence !== prev.project.sequence) {
      // Ruler labels bergantung pada durationSec.
      if (
        state.project.sequence.durationSec !== prev.project.sequence.durationSec
      ) {
        renderRulerInto(view.ruler, state.project.sequence.durationSec);
      }
      // Tracks + clips berubah (atau track metadata berubah).
      renderTracks(view.tracksContainer, state);
      renderTrackHeads(view.trackHeadsContainer, state);
      // Update playhead karena durasi bisa berubah.
      updatePlayheadState(view, state);
    }

    /* Selection berubah → toggle .selected class */
    if (state.selection.selectedClipIds !== prev.selection.selectedClipIds) {
      updateSelection(view, state);
    }

    /* UI timeline (zoom/snap) berubah */
    if (state.ui.timeline !== prev.ui.timeline) {
      updateZoom(view, state);
    }
    if (state.ui.timeline !== prev.ui.timeline) {
      updateZoom(view, state);
      if (state.ui.timeline.activeTool !== prev.ui.timeline.activeTool) {
        updateActiveTool(view, state);
      }
    }
  });

  /* Controller */
  const detach = attachTimelineController(view);

  return () => {
    detach();
    unsubscribe();
    container.replaceChildren();
  };
}
