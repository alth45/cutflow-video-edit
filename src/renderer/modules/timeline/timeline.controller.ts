import { on, delegate } from "@core/Dom";
import * as actions from "@state/actions";
import { appStore } from "@state/appStore";
import { pixelToProgress, progressToTime } from "./timeline.logic";
import type { TimelineView } from "./timeline.view";
import { SNAP_THRESHOLD_PX } from "./timeline.logic";
import { TIMELINE } from "@shared/constants";
import {
  computeSnapTargets,
  computeDragPosition,
  computeMultiDragBounds,
  computeMultiDragDelta,
  snapToTargets,
  type SnapCandidate,
  type MultiDragBounds,
} from "./clip-drag.logic";
import {
  clientXToTime,
  clampStart,
  buildClipFromAsset,
  DEFAULT_CLIP_DURATION_SEC,
  roundToTenth,
} from "./timeline-drop.logic";

import { computeTrimDuration } from "./clip-trim.logic";
import { getMaxClipDuration } from "@state/selectors";
import type { TimelineTool } from "@shared/types/state";
import {
  canSplitAt,
  computeClickRatio,
  ratioToSplitTime,
} from "./clip-split.logic";

import { getClipsInTrack } from "@state/selectors";
import { intersects, rectFromPoints, isTinyDrag } from "./clip-marquee.logic";
import { getTransitionById } from "@state/selectors";

import { openTextEditor } from "./text-editor.module";
import { getClipById } from "@state/selectors";

/* Threshold gerakan minimum (px) sebelum drag dianggap mulai —
   membedakan click (select only) dari drag (move). */
const DRAG_THRESHOLD_PX = 3;

interface DraggedClip {
  readonly clipId: string;
  readonly clipEl: HTMLElement;
  readonly initialStartSec: number;
  readonly durationSec: number;
}

/* ============================================================
   TIMELINE CONTROLLER
   ============================================================ */

export function attachTimelineController(view: TimelineView): () => void {
  const cleanups: Array<() => void> = [];
  /* Shared UI state antar drag handler. Not in store karena
     ephemeral (reset saat unmount). */
  const ctrlState = { lastAnchorClipId: null as string | null };
  /* ---- Zoom slider ---- */
  cleanups.push(
    on(view.zoomInput, "input", () => {
      actions.setZoom(Number(view.zoomInput.value));
    }),
  );

  cleanups.push(
    delegate(
      view.root,
      "click",
      ".tl-tools:not(.right) .icon-btn[data-tool]",
      (ev, btn) => {
        ev.stopPropagation();
        const tool = (btn as HTMLElement).dataset["tool"] as
          | import("@shared/types/state").TimelineTool
          | undefined;
        if (tool) actions.setActiveTool(tool);
      },
    ),
  );

  /* ---- Snap toggle ---- */
  cleanups.push(on(view.snapBtn, "click", () => actions.toggleSnap()));

  /* ---- Scrub: ruler + tracks area ---- */
  let scrubbing = false;

  const scrubStart = (ev: MouseEvent): void => {
    // Abaikan klik pada clip (ditangani terpisah untuk select).
    if ((ev.target as HTMLElement).closest(".clip")) return;
    if (appStore.getState().ui.timeline.activeTool === "hand") return;
    if (appStore.getState().ui.timeline.activeTool === "text") return;

    scrubbing = true;
    doScrub(ev);
    document.addEventListener("mousemove", onScrubMove);
    document.addEventListener("mouseup", onScrubEnd);
  };

  const onScrubMove = (ev: MouseEvent): void => {
    if (!scrubbing) return;
    doScrub(ev);
  };

  const onScrubEnd = (): void => {
    scrubbing = false;
    document.removeEventListener("mousemove", onScrubMove);
    document.removeEventListener("mouseup", onScrubEnd);
  };

  const doScrub = (ev: MouseEvent): void => {
    const rect = view.tlContent.getBoundingClientRect();
    const progress = pixelToProgress(ev.clientX, rect);
    const duration = appStore.getState().project.sequence.durationSec;
    actions.setCurrentTime(progressToTime(progress, duration));
  };

  cleanups.push(on(view.ruler, "mousedown", scrubStart as EventListener));

  /* ---- Click empty track → clear selection + set active track ---- */
  cleanups.push(
    delegate(view.tracksContainer, "click", ".track", (ev, trackEl) => {
      if ((ev.target as HTMLElement).closest(".clip")) return;
      if (appStore.getState().ui.timeline.activeTool === "hand") return;
      if (appStore.getState().ui.timeline.activeTool === "text") return;

      actions.clearSelection();
      const trackId = (trackEl as HTMLElement).dataset["trackId"];
      if (trackId) actions.setActiveTrack(trackId);
    }),
  );

  /* ---- Track header toggles (eye, lock) via delegation ---- */
  cleanups.push(
    delegate(
      view.trackHeadsContainer,
      "click",
      "button[data-toggle]",
      (ev, btn) => {
        ev.stopPropagation();
        const toggle = (btn as HTMLElement).dataset["toggle"];
        const trackTh = (btn as HTMLElement).closest(
          ".th",
        ) as HTMLElement | null;
        const trackId = trackTh?.dataset["trackId"];
        if (!trackId) return;

        if (toggle === "hidden") actions.toggleTrackHidden(trackId);
        else if (toggle === "locked") actions.toggleTrackLocked(trackId);
        else if (toggle === "locked") actions.toggleTrackLocked(trackId);
      },
    ),
  );

  /* ---- Cleanup scrub listeners on unmount ---- */
  cleanups.push(() => {
    document.removeEventListener("mousemove", onScrubMove);
    document.removeEventListener("mouseup", onScrubEnd);
  });

  cleanups.push(attachClipDrag(view, ctrlState));
  /* ---- Media drop dari panel ---- */
  cleanups.push(attachMediaDrop(view));
  cleanups.push(attachClipTrim(view));
  cleanups.push(attachMarquee(view));

  cleanups.push(attachHandPan(view));

  cleanups.push(attachTextTool(view));

  /* ---- Text clip double-click → edit content ---- */
  cleanups.push(
    delegate(view.tracksContainer, "dblclick", ".clip.text", (ev, clipEl) => {
      ev.stopPropagation();
      void handleTextClipDblClick(view, clipEl as HTMLElement);
    }),
  );

  /* ---- Transition box click ---- */
  cleanups.push(
    delegate(view.tracksContainer, "click", ".transition-box", (ev, boxEl) => {
      ev.stopPropagation();
      const el = boxEl as HTMLElement;
      if (appStore.getState().ui.timeline.activeTool === "hand") return;
      if (appStore.getState().ui.timeline.activeTool === "text") return;
      const transitionId = el.dataset["transitionId"];
      const beforeClipId = el.dataset["beforeClipId"];
      const afterClipId = el.dataset["afterClipId"];

      const state = appStore.getState();

      /* Cari track yang punya junction ini. */
      const track = state.project.sequence.tracks.find(
        (t) => beforeClipId && t.clips.some((c) => c.id === beforeClipId),
      );
      if (!track || track.locked) return;
      /* Seek playhead ke junction (transition center). */
      const clipBefore = track.clips.find((c) => c.id === beforeClipId);
      if (clipBefore) {
        const junctionSec = clipBefore.startSec + clipBefore.durationSec;
        const playhead = state.playback.currentTimeSec;
        if (Math.abs(playhead - junctionSec) > 0.05) {
          actions.setCurrentTime(junctionSec);
        }
      }
      /* Existing transition → select. */
      if (transitionId) {
        actions.selectTransition(transitionId);
        return;
      }

      /* Empty junction → add default transition + select. */
      if (beforeClipId && afterClipId) {
        actions.addTransition(track.id, beforeClipId, afterClipId);
      }
    }),
  );

  return () => cleanups.forEach((fn) => fn());
}
/* ============================================================
   CLIP DRAG (single & multi)
   ------------------------------------------------------------
   - Single: drag satu clip (F14b).
   - Multi:  drag semua clip yang di-select bersama (F14i).
   - Modifier Ctrl/Shift: selection change, tidak start drag.
   - Klik tanpa drag pada multi-selection: collapse selection
     ke clip yang diklik (standard Premiere/Figma behavior).
   ============================================================ */

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

function attachClipDrag(
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

    /* Click tanpa drag pada multi-selection → collapse ke clip
       yang diklik (standard editor behavior). */
    if (!moved) {
      if (wasMultiSelection) {
        actions.selectClip(primaryClipId);
      }

      /* Seek preview ke clip kalau playhead tidak di dalam clip. */
      const latest = appStore.getState();
      const clip = latest.project.sequence.tracks
        .flatMap((t) => t.clips)
        .find((c) => c.id === primaryClipId);
      if (clip) {
        const playhead = latest.playback.currentTimeSec;
        const inside =
          playhead >= clip.startSec &&
          playhead < clip.startSec + clip.durationSec;
        if (!inside) {
          actions.setCurrentTime(clip.startSec + 0.05);
        }
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

/* ============================================================
   MEDIA DROP
   ------------------------------------------------------------
   Drop dari media panel (thumbnail) ke track → buat clip baru.
   Ghost preview menunjukkan posisi + lebar clip sebelum drop.

   Alur:
   - dragover → cek MIME types, validasi track kind, tampilkan
     ghost di posisi drop (snap jika magnet aktif).
   - dragleave → sembunyikan ghost kalau keluar dari tracksContainer.
   - drop → build clip dari asset, actions.addClip, select clip.
   - dragend (global) → safety net untuk cancel (Escape).
   ============================================================ */

function attachMediaDrop(view: TimelineView): () => void {
  const cleanups: Array<() => void> = [];

  const onDragOver = (ev: DragEvent): void => {
    const types = ev.dataTransfer?.types ?? [];
    const hasVideo = types.includes("application/x-cutflow-media-video");
    const hasAudio = types.includes("application/x-cutflow-media-audio");
    if (!hasVideo && !hasAudio) return; // not our data

    const target = ev.target;
    if (!(target instanceof Element)) return;
    if (target.closest(".transition-box")) return;

    const trackEl = target.closest<HTMLElement>(".track");
    if (!trackEl) return;

    const trackId = trackEl.dataset["trackId"];
    if (!trackId) return;

    const state = appStore.getState();
    const track = state.project.sequence.tracks.find((t) => t.id === trackId);
    if (!track || track.locked) return;

    const canDrop =
      (track.kind === "video" && hasVideo) ||
      (track.kind === "audio" && hasAudio);
    if (!canDrop) return;

    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";

    const tlRect = view.tlContent.getBoundingClientRect();
    const durationSec = state.project.sequence.durationSec;

    /* Calculate start (with snap if enabled). */
    let startSec = clientXToTime(ev.clientX, tlRect, durationSec);
    const clipDur = Math.min(DEFAULT_CLIP_DURATION_SEC, durationSec - startSec);
    startSec = clampStart(startSec, clipDur, durationSec);

    if (state.ui.timeline.snapEnabled && tlRect.width > 0) {
      const pxPerSec = tlRect.width / durationSec;
      const thresholdSec = SNAP_THRESHOLD_PX / pxPerSec;
      const targets = computeSnapTargets(
        [], // no self
        state.project.sequence.tracks,
        state.playback.currentTimeSec,
        durationSec,
      );
      const snapped = snapToTargets(startSec, targets, thresholdSec);
      if (snapped.snapped) {
        startSec = clampStart(snapped.sec, clipDur, durationSec);
      }
    } else {
      startSec = roundToTenth(startSec);
    }

    showDropGhost(view, track.id, startSec, clipDur, durationSec);
  };

  const onDragLeave = (ev: DragEvent): void => {
    if (
      ev.relatedTarget instanceof Node &&
      view.tracksContainer.contains(ev.relatedTarget)
    ) {
      return; // still inside tracks area
    }
    hideDropGhost(view);
  };

  const onDrop = (ev: DragEvent): void => {
    ev.preventDefault();
    hideDropGhost(view);

    const assetId =
      ev.dataTransfer?.getData("application/x-cutflow-media-video") ||
      ev.dataTransfer?.getData("application/x-cutflow-media-audio");
    if (!assetId) return;

    const target = ev.target;
    if (!(target instanceof Element)) return;

    const trackEl = target.closest<HTMLElement>(".track");
    if (!trackEl) return;
    const trackId = trackEl.dataset["trackId"];
    if (!trackId) return;

    const state = appStore.getState();
    const track = state.project.sequence.tracks.find((t) => t.id === trackId);
    if (!track || track.locked) return;

    const asset = state.project.mediaAssets.find((a) => a.id === assetId);
    if (!asset) return;

    const requiredKind = asset.kind === "audio" ? "audio" : "video";
    if (track.kind !== requiredKind) return;

    const tlRect = view.tlContent.getBoundingClientRect();
    const durationSec = state.project.sequence.durationSec;
    const rawStart = clientXToTime(ev.clientX, tlRect, durationSec);

    const clip = buildClipFromAsset(asset, rawStart);
    actions.addClip(trackId, clip);
    actions.selectClip(clip.id);
  };

  const onDragEnd = (): void => {
    hideDropGhost(view);
  };

  cleanups.push(
    on(view.tracksContainer, "dragover", onDragOver as EventListener),
  );
  cleanups.push(
    on(view.tracksContainer, "dragleave", onDragLeave as EventListener),
  );
  cleanups.push(on(view.tracksContainer, "drop", onDrop as EventListener));
  cleanups.push(on(document, "dragend", onDragEnd));

  return () => cleanups.forEach((fn) => fn());
}

function showDropGhost(
  view: TimelineView,
  trackId: string,
  startSec: number,
  clipDur: number,
  durationSec: number,
): void {
  const state = appStore.getState();
  const trackIdx = state.project.sequence.tracks.findIndex(
    (t) => t.id === trackId,
  );
  if (trackIdx < 0) return;

  const topPx =
    TIMELINE.RULER_HEIGHT_PX + trackIdx * TIMELINE.TRACK_HEIGHT_PX + 4;
  const heightPx = TIMELINE.TRACK_HEIGHT_PX - 8;
  const leftPct = (startSec / durationSec) * 100;
  const widthPct = (clipDur / durationSec) * 100;

  view.dropGhost.style.top = `${topPx}px`;
  view.dropGhost.style.left = `${leftPct}%`;
  view.dropGhost.style.width = `${widthPct}%`;
  view.dropGhost.style.height = `${heightPx}px`;
  view.dropGhost.classList.add("visible");
}

function hideDropGhost(view: TimelineView): void {
  view.dropGhost.classList.remove("visible");
}

/* ============================================================
   CLIP TRIM
   ------------------------------------------------------------
   Drag right-handle untuk resize duration. Video/audio dibatasi
   asset.durationSec; image dibatasi sisa sequence.
   ============================================================ */

interface TrimState {
  readonly clipEl: HTMLElement;
  readonly clipId: string;
  readonly initialDur: number;
  readonly maxDur: number;
  readonly startX: number;
  readonly pxPerSec: number;
  moved: boolean;
  lastDur: number;
}

function attachClipTrim(view: TimelineView): () => void {
  let trim: TrimState | null = null;

  const onMouseDown = (ev: MouseEvent): void => {
    if (ev.button !== 0) return;
    /* Razor mode tidak bisa trim. */
    if (appStore.getState().ui.timeline.activeTool === "razor") return;

    const target = ev.target;
    if (!(target instanceof Element)) return;

    if (appStore.getState().ui.timeline.activeTool === "hand") return;
    if (appStore.getState().ui.timeline.activeTool === "text") return;
    const handle = target.closest<HTMLElement>(".clip-trim-right");
    if (!handle) return;

    const clipEl = handle.closest<HTMLElement>(".clip");
    if (!clipEl) return;
    const clipId = clipEl.dataset["clipId"];
    if (!clipId) return;

    const state = appStore.getState();
    const track = state.project.sequence.tracks.find((t) =>
      t.clips.some((c) => c.id === clipId),
    );
    if (!track || track.locked) return;

    const clip = track.clips.find((c) => c.id === clipId);
    if (!clip) return;

    const tlRect = view.tlContent.getBoundingClientRect();
    const durationSec = state.project.sequence.durationSec;
    if (tlRect.width <= 0 || durationSec <= 0) return;

    const maxDur = getMaxClipDuration(state, clip);

    trim = {
      clipEl,
      clipId,
      initialDur: clip.durationSec,
      maxDur,
      startX: ev.clientX,
      pxPerSec: tlRect.width / durationSec,
      moved: false,
      lastDur: clip.durationSec,
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    ev.preventDefault();
    ev.stopPropagation();
  };

  const onMouseMove = (ev: MouseEvent): void => {
    if (!trim) return;

    const dx = ev.clientX - trim.startX;
    if (!trim.moved) {
      if (Math.abs(dx) < 2) return;
      trim.moved = true;
      trim.clipEl.classList.add("trimming");
    }

    const deltaSec = dx / trim.pxPerSec;
    const newDur = computeTrimDuration(trim.initialDur, deltaSec, trim.maxDur);
    trim.lastDur = newDur;

    const duration = appStore.getState().project.sequence.durationSec;
    const widthPct = (newDur / duration) * 100;
    trim.clipEl.style.width = `${widthPct}%`;
  };

  const onMouseUp = (): void => {
    if (!trim) return;
    const { clipId, initialDur, lastDur, moved, clipEl } = trim;

    clipEl.classList.remove("trimming");
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    trim = null;

    if (moved && Math.abs(lastDur - initialDur) > 0.001) {
      actions.setClipDuration(clipId, lastDur);
    }
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

/* ============================================================
   MARQUEE SELECTION
   ------------------------------------------------------------
   Drag di empty area track → rubber-band rectangle. Clip yang
   intersect dengan rect ter-select (replace).

   - Klik tanpa drag (< 5px) → clearSelection + setActiveTrack.
   - Shift+Click empty → preserve selection (no-op).
   - Ctrl+Click empty → clearSelection (standard: deselect-all).
   - Razor mode → marquee disabled (razor hanya untuk cut).
   ============================================================ */

function attachMarquee(view: TimelineView): () => void {
  let active = false;
  let startClientX = 0;
  let startClientY = 0;
  let tlRect: DOMRect | null = null;
  let clickedTrackId: string | null = null;
  let shiftAtStart = false;

  const onMouseDown = (ev: MouseEvent): void => {
    if (ev.button !== 0) return;

    const state = appStore.getState();

    /* Razor mode: tidak ada marquee. */
    if (state.ui.timeline.activeTool === "razor") return;
    if (state.ui.timeline.activeTool === "hand") return;
    if (state.ui.timeline.activeTool === "text") return;
    const target = ev.target;
    if (!(target instanceof Element)) return;

    /* Skip kalau klik di clip (ditangani attachClipDrag). */
    if (target.closest(".clip") || target.closest(".clip-trim")) return;
    if (target.closest(".transition-box")) return;

    /* Skip kalau bukan di track area. */
    if (!view.tracksContainer.contains(target)) return;

    const trackEl = target.closest<HTMLElement>(".track");
    clickedTrackId = trackEl?.dataset["trackId"] ?? null;

    const rect = view.tlContent.getBoundingClientRect();
    tlRect = rect;
    startClientX = ev.clientX;
    startClientY = ev.clientY;
    shiftAtStart = ev.shiftKey;

    active = true;
    view.marquee.style.left = `${ev.clientX - rect.left}px`;
    view.marquee.style.top = `${ev.clientY - rect.top}px`;
    view.marquee.style.width = "0px";
    view.marquee.style.height = "0px";
    view.marquee.classList.add("visible");

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    ev.preventDefault();
  };

  const onMouseMove = (ev: MouseEvent): void => {
    if (!active || !tlRect) return;

    const x1 = startClientX - tlRect.left;
    const y1 = startClientY - tlRect.top;
    const x2 = ev.clientX - tlRect.left;
    const y2 = ev.clientY - tlRect.top;

    const r = rectFromPoints(x1, y1, x2, y2);
    view.marquee.style.left = `${r.left}px`;
    view.marquee.style.top = `${r.top}px`;
    view.marquee.style.width = `${r.right - r.left}px`;
    view.marquee.style.height = `${r.bottom - r.top}px`;
  };

  const onMouseUp = (): void => {
    if (!active) return;
    active = false;
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);

    /* Capture rect SEBELUM hide — hide (display: none) reset size. */
    const marqueeRect = view.marquee.getBoundingClientRect();
    view.marquee.classList.remove("visible");

    const rect = {
      left: marqueeRect.left,
      top: marqueeRect.top,
      right: marqueeRect.right,
      bottom: marqueeRect.bottom,
    };

    /* Small click = deselect (kecuali Shift+Click = preserve). */
    if (isTinyDrag(rect, 5)) {
      if (!shiftAtStart) {
        actions.clearSelection();
        if (clickedTrackId) actions.setActiveTrack(clickedTrackId);
      }
      return;
    }

    /* Marquee: kumpulkan clip yang intersect. */
    const clipEls = view.tracksContainer.querySelectorAll<HTMLElement>(
      ".clip[data-clip-id]",
    );
    const ids: string[] = [];
    clipEls.forEach((clipEl) => {
      const cr = clipEl.getBoundingClientRect();
      const clipRect = {
        left: cr.left,
        top: cr.top,
        right: cr.right,
        bottom: cr.bottom,
      };
      if (intersects(rect, clipRect)) {
        const id = clipEl.dataset["clipId"];
        if (id) ids.push(id);
      }
    });

    if (ids.length > 0) {
      actions.setSelectedClips(ids);
    } else if (!shiftAtStart) {
      actions.clearSelection();
    }
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

/* ============================================================
   HAND PAN (F14l)
   ------------------------------------------------------------
   Saat hand tool aktif, drag di tl-scroll = pan viewport
   (horizontal & vertikal). Mouse delta inversif: geser mouse
   ke kanan = scroll viewport ke kiri (melihat konten lebih
   kiri), seperti grab-and-drag.

   Prasyarat: overflow aktif (zoom > 1 untuk horizontal, banyak
   track untuk vertikal). Kalau konten fit viewport, pan = no-op.
   ============================================================ */

function attachHandPan(view: TimelineView): () => void {
  let active = false;
  let startX = 0;
  let startY = 0;
  let startScrollLeft = 0;
  let startScrollTop = 0;

  const onMouseDown = (ev: MouseEvent): void => {
    if (ev.button !== 0) return;
    if (appStore.getState().ui.timeline.activeTool !== "hand") return;

    active = true;
    startX = ev.clientX;
    startY = ev.clientY;
    startScrollLeft = view.tlScroll.scrollLeft;
    startScrollTop = view.tlScroll.scrollTop;

    view.tlScroll.classList.add("panning");
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    ev.preventDefault();
  };

  const onMouseMove = (ev: MouseEvent): void => {
    if (!active) return;
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    view.tlScroll.scrollLeft = startScrollLeft - dx;
    view.tlScroll.scrollTop = startScrollTop - dy;
  };

  const onMouseUp = (): void => {
    if (!active) return;
    active = false;
    view.tlScroll.classList.remove("panning");
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  };

  const downCleanup = on(
    view.tlScroll,
    "mousedown",
    onMouseDown as EventListener,
  );

  return () => {
    downCleanup();
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  };
}

/* ============================================================
   TEXT TOOL (F14m)
   ------------------------------------------------------------
   Klik di empty area video track → buat text clip di posisi
   klik. Track audio = no-op. Tool tetap aktif setelah create
   (multi-place, seperti razor).
   ============================================================ */

function attachTextTool(view: TimelineView): () => void {
  const onMouseDown = (ev: MouseEvent): void => {
    if (ev.button !== 0) return;

    const state = appStore.getState();
    if (state.ui.timeline.activeTool !== "text") return;

    const target = ev.target;
    if (!(target instanceof Element)) return;

    /* Skip di existing elements — jangan create text on-top of clip
       atau transition box. */
    if (target.closest(".clip")) return;
    if (target.closest(".clip-trim")) return;
    if (target.closest(".transition-box")) return;

    /* Harus di dalam track area. */
    const trackEl = target.closest<HTMLElement>(".track");
    if (!trackEl) return;

    const trackId = trackEl.dataset["trackId"];
    if (!trackId) return;

    const track = state.project.sequence.tracks.find((t) => t.id === trackId);
    if (!track || track.locked) return;
    if (track.kind !== "video") return;

    /* Konversi X → waktu sequence. */
    const tlRect = view.tlContent.getBoundingClientRect();
    const durationSec = state.project.sequence.durationSec;
    if (tlRect.width <= 0 || durationSec <= 0) return;

    const px = ev.clientX - tlRect.left;
    const progress = Math.max(0, Math.min(1, px / tlRect.width));
    const startSec = progress * durationSec;

    actions.addTextClip(trackId, startSec);
    ev.preventDefault();
  };

  return on(view.tracksContainer, "mousedown", onMouseDown as EventListener);
}

/* ============================================================
   TEXT CLIP EDIT (F14n)
   ------------------------------------------------------------
   Double-click pada text clip → buka modal → save content.
   Hanya aktif di pointer tool (razor/hand/text = no-op).
   ============================================================ */

async function handleTextClipDblClick(
  view: TimelineView,
  clipEl: HTMLElement,
): Promise<void> {
  const state = appStore.getState();
  if (state.ui.timeline.activeTool !== "pointer") return;

  const clipId = clipEl.dataset["clipId"];
  if (!clipId) return;

  const clip = getClipById(state, clipId);
  if (!clip || clip.kind !== "text") return;

  const track = state.project.sequence.tracks.find((t) =>
    t.clips.some((c) => c.id === clipId),
  );
  if (!track || track.locked) return;

  const result = await openTextEditor({
    initialValue: clip.source.content,
    title: "Edit text clip",
    placeholder: "Enter text…",
  });

  if (result === null) return; // cancelled

  actions.updateTextClipContent(clipId, result);

  /* Focus kembali ke timeline setelah modal close supaya
     keyboard shortcuts berfungsi (Escape, Space, dll.). */
  view.tlScroll.focus();
}
