import { on, delegate } from "@core/Dom";
import * as actions from "@state/actions";
import { appStore } from "@state/appStore";
import { getClipById } from "@state/selectors";
import { pixelToProgress, progressToTime } from "./timeline.logic";
import type { TimelineTool } from "@shared/types/state";
import { attachClipDrag } from "./clip-drag.controller";
import { attachMediaDrop } from "./media-drop.controller";
import { attachClipTrim } from "./clip-trim.controller";
import { attachMarquee } from "./marquee.controller";
import { attachHandPan } from "./hand-pan.controller";
import { attachTextTool, handleTextClipDblClick } from "./text-tool.controller";
import { openTransitionKindMenu } from "./transition-kind-menu";
import type { TimelineView } from "./timeline.view";

/* ============================================================
   TIMELINE CONTROLLER — ORCHESTRATOR
   ------------------------------------------------------------
   Attaches all event handlers. Non-trivial handlers live in
   `*.controller.ts` files (clip-drag, media-drop, clip-trim,
   marquee, hand-pan, text-tool).

   Inline handlers (this file): zoom slider, tool buttons,
   snap toggle, keyframe button, scrub, track empty-click,
   track header toggles, transition-box click + context menu,
   text clip dblclick delegate.
   ============================================================ */
export function attachTimelineController(view: TimelineView): () => void {
  const cleanups: Array<() => void> = [];

  /* Shared ephemeral UI state across drag handlers. */
  const ctrlState = { lastAnchorClipId: null as string | null };

  /* ---- Zoom slider ---- */
  cleanups.push(
    on(view.zoomInput, "input", () => {
      actions.setZoom(Number(view.zoomInput.value));
    }),
  );

  /* ---- Tool buttons ---- */
  cleanups.push(
    delegate(
      view.root,
      "click",
      ".tl-tools:not(.right) .icon-btn[data-tool]",
      (ev, btn) => {
        ev.stopPropagation();
        const tool = (btn as HTMLElement).dataset["tool"] as
          | TimelineTool
          | undefined;
        if (tool) actions.setActiveTool(tool);
      },
    ),
  );

  /* ---- Snap toggle ---- */
  cleanups.push(on(view.snapBtn, "click", () => actions.toggleSnap()));

  /* ---- Keyframe toggle button ---- */
  cleanups.push(
    on(view.keyframeBtn, "click", () => {
      const state = appStore.getState();
      const activeId = state.selection.selectedClipIds[0];
      if (!activeId) return;

      const clip = getClipById(state, activeId);
      if (!clip) return;

      const localTime = Math.max(
        0,
        Math.min(
          clip.durationSec,
          state.playback.currentTimeSec - clip.startSec,
        ),
      );

      actions.toggleAllKeyframesAtPlayhead(activeId, localTime);
    }),
  );

  /* ---- Scrub (ruler drag) ---- */
  let scrubbing = false;

  const doScrub = (ev: MouseEvent): void => {
    const rect = view.tlContent.getBoundingClientRect();
    const progress = pixelToProgress(ev.clientX, rect);
    const duration = appStore.getState().project.sequence.durationSec;
    actions.setCurrentTime(progressToTime(progress, duration));
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

  const scrubStart = (ev: MouseEvent): void => {
    if ((ev.target as HTMLElement).closest(".clip")) return;
    const tool = appStore.getState().ui.timeline.activeTool;
    if (tool === "hand" || tool === "text") return;

    scrubbing = true;
    doScrub(ev);
    document.addEventListener("mousemove", onScrubMove);
    document.addEventListener("mouseup", onScrubEnd);
  };

  cleanups.push(on(view.ruler, "mousedown", scrubStart as EventListener));
  cleanups.push(() => {
    document.removeEventListener("mousemove", onScrubMove);
    document.removeEventListener("mouseup", onScrubEnd);
  });

  /* ---- Click empty track → clear selection + set active track ---- */
  cleanups.push(
    delegate(view.tracksContainer, "click", ".track", (ev, trackEl) => {
      if ((ev.target as HTMLElement).closest(".clip")) return;
      const tool = appStore.getState().ui.timeline.activeTool;
      if (tool === "hand" || tool === "text") return;

      actions.clearSelection();
      const trackId = (trackEl as HTMLElement).dataset["trackId"];
      if (trackId) actions.setActiveTrack(trackId);
    }),
  );

  /* ---- Track header toggles (mute/hide + lock) ---- */
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
        else if (toggle === "muted") actions.toggleTrackMuted(trackId);
        else if (toggle === "locked") actions.toggleTrackLocked(trackId);
      },
    ),
  );

  /* ---- Transition box click (select / add) ---- */
  cleanups.push(
    delegate(view.tracksContainer, "click", ".transition-box", (ev, boxEl) => {
      ev.stopPropagation();
      const tool = appStore.getState().ui.timeline.activeTool;
      if (tool === "hand" || tool === "text") return;

      const el = boxEl as HTMLElement;
      const transitionId = el.dataset["transitionId"];
      const beforeClipId = el.dataset["beforeClipId"];
      const afterClipId = el.dataset["afterClipId"];

      const state = appStore.getState();
      const track = state.project.sequence.tracks.find(
        (t) => beforeClipId && t.clips.some((c) => c.id === beforeClipId),
      );
      if (!track || track.locked) return;

      /* Seek playhead to junction (transition center). */
      const clipBefore = track.clips.find((c) => c.id === beforeClipId);
      if (clipBefore) {
        const junctionSec = clipBefore.startSec + clipBefore.durationSec;
        const playhead = state.playback.currentTimeSec;
        if (Math.abs(playhead - junctionSec) > 0.05) {
          actions.setCurrentTime(junctionSec);
        }
      }

      if (transitionId) {
        actions.selectTransition(transitionId);
        return;
      }

      if (beforeClipId && afterClipId) {
        actions.addTransition(track.id, beforeClipId, afterClipId);
      }
    }),
  );

  /* ---- Transition box right-click → kind menu ---- */
  cleanups.push(
    on(view.tracksContainer, "contextmenu", (ev) => {
      const target = ev.target;
      if (!(target instanceof Element)) return;
      const box = target.closest<HTMLElement>(".transition-box");
      if (!box) return;

      ev.preventDefault();
      ev.stopPropagation();

      const state = appStore.getState();
      const tool = state.ui.timeline.activeTool;
      if (tool === "hand" || tool === "razor") return;

      const beforeClipId = box.dataset["beforeClipId"];
      const afterClipId = box.dataset["afterClipId"];
      if (!beforeClipId || !afterClipId) return;

      const track = state.project.sequence.tracks.find((t) =>
        t.clips.some((c) => c.id === beforeClipId),
      );
      if (!track || track.locked) return;

      const transitionId = box.dataset["transitionId"];
      const existing = transitionId
        ? (track.transitions.find((t) => t.id === transitionId) ?? null)
        : null;

      if (existing) actions.selectTransition(existing.id);

      openTransitionKindMenu(
        box,
        existing?.kind ?? null,
        (kind) => {
          if (existing) {
            actions.setTransitionKind(existing.id, kind);
          } else {
            actions.addTransition(track.id, beforeClipId, afterClipId, kind);
          }
        },
        existing ? () => actions.removeTransition(existing.id) : undefined,
      );
    }),
  );

  /* ---- Text clip double-click → edit content ---- */
  cleanups.push(
    delegate(view.tracksContainer, "dblclick", ".clip.text", (ev, clipEl) => {
      ev.stopPropagation();
      void handleTextClipDblClick(view, clipEl as HTMLElement);
    }),
  );

  /* ---- Attach sub-controllers ---- */
  cleanups.push(attachClipDrag(view, ctrlState));
  cleanups.push(attachMediaDrop(view));
  cleanups.push(attachClipTrim(view));
  cleanups.push(attachMarquee(view));
  cleanups.push(attachHandPan(view));
  cleanups.push(attachTextTool(view));

  return () => cleanups.forEach((fn) => fn());
}
