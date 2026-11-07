import { on } from "@core/Dom";
import * as actions from "@state/actions";
import { appStore } from "@state/appStore";
import { getClipsInTrack } from "@state/selectors";
import { SNAP_THRESHOLD_PX } from "./timeline.logic";
import {
  computeSnapTargets,
  computeMultiDragBounds,
  computeMultiDragDelta,
  type SnapCandidate,
  type MultiDragBounds,
} from "./clip-drag.logic";
import {
  computeClickRatio,
  ratioToSplitTime,
  canSplitAt,
} from "./clip-split.logic";
import type { TimelineView } from "./timeline.view";

/* Threshold gerakan minimum (px) sebelum drag dianggap mulai —
   membedakan click (select only) dari drag (move). */
const DRAG_THRESHOLD_PX = 3;

interface DraggedClip {
  readonly clipId: string;
  readonly clipEl: HTMLElement;
  readonly initialStartSec: number;
  readonly durationSec: number;
}

interface DragState {
  readonly primaryClipId: string;
  readonly primaryClipEl: HTMLElement;
  readonly primaryInitialStartSec: number;
  readonly clips: readonly DraggedClip[];
  readonly bounds: MultiDragBounds;
  readonly startX: number;
  readonly pxPerSec: number;
  readonly durationSec: number;
  readonly targets: readonly SnapCandidate[];
  readonly thresholdSec: number;
  readonly wasMultiSelection: boolean;
  moved: boolean;
  lastDeltaSec: number;
}

/* ============================================================
   CLIP DRAG (single & multi)
   ------------------------------------------------------------
   - Single: drag satu clip.
   - Multi:  drag semua clip yang di-select bersama.
   - Modifier Ctrl/Shift: selection change, tidak start drag.
   - Razor mode: split clip, no drag.
   - Klik tanpa drag pada multi-selection: collapse selection.
   ============================================================ */
export function attachClipDrag(
  view: TimelineView,
  ctrlState: { lastAnchorClipId: string | null },
): () => void {
  let drag: DragState | null = null;

  const onMouseDown = (ev: MouseEvent): void => {
    if (ev.button !== 0) return;
    const target = ev.target;
    if (!(target instanceof Element)) return;

    const state = appStore.getState();
    if (state.ui.timeline.activeTool === "hand") return;
    if (state.ui.timeline.activeTool === "text") return;
    if (target.closest(".clip-trim")) return;
    if (target.closest(".transition-box")) return;

    const clipEl = target.closest<HTMLElement>(".clip");
    if (!clipEl) return;
    const clipId = clipEl.dataset["clipId"];
    if (!clipId) return;

    const track = state.project.sequence.tracks.find((t) =>
      t.clips.some((c) => c.id === clipId),
    );
    if (!track) return;
    const clip = track.clips.find((c) => c.id === clipId);
    if (!clip) return;

    /* ---- Razor mode: split, no drag ---- */
    if (state.ui.timeline.activeTool === "razor") {
      ev.preventDefault();
      if (track.locked) return;

      const tlRect = view.tlContent.getBoundingClientRect();
      const clipRect = clipEl.getBoundingClientRect();
      if (tlRect.width <= 0 || clipRect.width <= 0) return;

      const ratio = computeClickRatio(ev.clientX, clipRect);
      let splitSec = ratioToSplitTime(ratio, clip.startSec, clip.durationSec);

      if (state.ui.timeline.snapEnabled) {
        const pxPerSec = tlRect.width / state.project.sequence.durationSec;
        const playheadSec = state.playback.currentTimeSec;
        const distPx = Math.abs(splitSec - playheadSec) * pxPerSec;
        if (distPx < SNAP_THRESHOLD_PX) splitSec = playheadSec;
      }

      if (canSplitAt(clip, splitSec)) {
        actions.splitClip(clipId, splitSec);
      }
      return;
    }

    /* ---- Ctrl+Click: toggle, no drag ---- */
    if (ev.ctrlKey || ev.metaKey) {
      actions.toggleClipSelection(clipId);
      ctrlState.lastAnchorClipId = clipId;
      return;
    }

    /* ---- Shift+Click: range, no drag ---- */
    if (ev.shiftKey && ctrlState.lastAnchorClipId) {
      const trackClipIds = getClipsInTrack(track).map((c) => c.id);
      const aIdx = trackClipIds.indexOf(ctrlState.lastAnchorClipId);
      const cIdx = trackClipIds.indexOf(clipId);
      if (aIdx >= 0 && cIdx >= 0) {
        const [lo, hi] = aIdx <= cIdx ? [aIdx, cIdx] : [cIdx, aIdx];
        actions.setSelectedClips(trackClipIds.slice(lo, hi + 1));
        ctrlState.lastAnchorClipId = clipId;
        return;
      }
    }

    /* ---- Plain click: single-select only if not in multi-selection ---- */
    const wasMultiSelection =
      state.selection.selectedClipIds.length > 1 &&
      state.selection.selectedClipIds.includes(clipId);

    if (!wasMultiSelection) {
      actions.selectClip(clipId);
      ctrlState.lastAnchorClipId = clipId;
    }

    if (track.locked) return;

    /* ---- Build drag set (1 or N clips) ---- */
    const clipsToDrag: DraggedClip[] = [];

    if (wasMultiSelection) {
      for (const id of state.selection.selectedClipIds) {
        const sTrack = state.project.sequence.tracks.find((t) =>
          t.clips.some((c) => c.id === id),
        );
        if (!sTrack || sTrack.locked) continue;
        const sClip = sTrack.clips.find((c) => c.id === id);
        if (!sClip) continue;
        const sEl = view.tracksContainer.querySelector<HTMLElement>(
          `.clip[data-clip-id="${id}"]`,
        );
        if (!sEl) continue;
        clipsToDrag.push({
          clipId: id,
          clipEl: sEl,
          initialStartSec: sClip.startSec,
          durationSec: sClip.durationSec,
        });
      }
    } else {
      clipsToDrag.push({
        clipId,
        clipEl,
        initialStartSec: clip.startSec,
        durationSec: clip.durationSec,
      });
    }

    if (clipsToDrag.length === 0) return;

    const tlRect = view.tlContent.getBoundingClientRect();
    const durationSec = state.project.sequence.durationSec;
    if (tlRect.width <= 0 || durationSec <= 0) return;

    const pxPerSec = tlRect.width / durationSec;
    const excludedIds = clipsToDrag.map((c) => c.clipId);
    const bounds = computeMultiDragBounds(
      clipsToDrag.map((c) => ({
        initialStartSec: c.initialStartSec,
        durationSec: c.durationSec,
      })),
    );

    drag = {
      primaryClipId: clipId,
      primaryClipEl: clipEl,
      primaryInitialStartSec: clip.startSec,
      clips: clipsToDrag,
      bounds,
      startX: ev.clientX,
      pxPerSec,
      durationSec,
      targets: computeSnapTargets(
        excludedIds,
        state.project.sequence.tracks,
        state.playback.currentTimeSec,
        durationSec,
      ),
      thresholdSec: SNAP_THRESHOLD_PX / pxPerSec,
      wasMultiSelection,
      moved: false,
      lastDeltaSec: 0,
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    ev.preventDefault();
  };

  const onMouseMove = (ev: MouseEvent): void => {
    if (!drag) return;

    const dx = ev.clientX - drag.startX;
    if (!drag.moved) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      drag.moved = true;
      for (const c of drag.clips) c.clipEl.classList.add("dragging");
    }

    const rawDeltaSec = dx / drag.pxPerSec;
    const snapEnabled = appStore.getState().ui.timeline.snapEnabled;

    const result = computeMultiDragDelta(
      rawDeltaSec,
      drag.primaryInitialStartSec,
      drag.bounds,
      snapEnabled,
      drag.targets,
      drag.thresholdSec,
    );

    drag.lastDeltaSec = result.deltaSec;

    for (const c of drag.clips) {
      const newStart = Math.max(0, c.initialStartSec + result.deltaSec);
      const pct = (newStart / drag.durationSec) * 100;
      c.clipEl.style.left = `${pct}%`;
    }

    if (result.snapped) {
      showGuide(view, result.snapped.sec, drag.durationSec);
    } else {
      hideGuide(view);
    }
  };

  const onMouseUp = (): void => {
    if (!drag) return;
    const { clips, lastDeltaSec, moved, wasMultiSelection, primaryClipId } =
      drag;

    for (const c of clips) c.clipEl.classList.remove("dragging");
    hideGuide(view);
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);

    drag = null;

    if (!moved) {
      if (wasMultiSelection) actions.selectClip(primaryClipId);

      /* Seek preview to clip if playhead is outside. */
      const latest = appStore.getState();
      const clip = latest.project.sequence.tracks
        .flatMap((t) => t.clips)
        .find((c) => c.id === primaryClipId);
      if (clip) {
        const playhead = latest.playback.currentTimeSec;
        const inside =
          playhead >= clip.startSec &&
          playhead < clip.startSec + clip.durationSec;
        if (!inside) actions.setCurrentTime(clip.startSec + 0.05);
      }
      return;
    }

    if (Math.abs(lastDeltaSec) < 0.001) return;

    const moves = clips.map((c) => ({
      clipId: c.clipId,
      startSec: c.initialStartSec + lastDeltaSec,
    }));
    actions.moveClipsBulk(moves);
  };

  const downCleanup = on(
    view.tracksContainer,
    "mousedown",
    onMouseDown as EventListener,
  );

  return () => {
    downCleanup();
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  };
}

function showGuide(view: TimelineView, sec: number, durationSec: number): void {
  const pct = (sec / durationSec) * 100;
  view.snapGuide.style.left = `${pct}%`;
  view.snapGuide.classList.add("visible");
}

function hideGuide(view: TimelineView): void {
  view.snapGuide.classList.remove("visible");
}
