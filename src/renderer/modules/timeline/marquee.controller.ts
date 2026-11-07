import { on } from "@core/Dom";
import * as actions from "@state/actions";
import { appStore } from "@state/appStore";
import { intersects, rectFromPoints, isTinyDrag } from "./clip-marquee.logic";
import type { TimelineView } from "./timeline.view";

/* ============================================================
   MARQUEE SELECTION
   ------------------------------------------------------------
   Drag di empty area track → rubber-band rectangle. Clip yang
   intersect ter-select (replace).
   ============================================================ */
export function attachMarquee(view: TimelineView): () => void {
  let active = false;
  let startClientX = 0;
  let startClientY = 0;
  let tlRect: DOMRect | null = null;
  let clickedTrackId: string | null = null;
  let shiftAtStart = false;

  const onMouseDown = (ev: MouseEvent): void => {
    if (ev.button !== 0) return;

    const state = appStore.getState();
    const tool = state.ui.timeline.activeTool;
    if (tool === "razor" || tool === "hand" || tool === "text") return;

    const target = ev.target;
    if (!(target instanceof Element)) return;

    if (target.closest(".clip") || target.closest(".clip-trim")) return;
    if (target.closest(".transition-box")) return;
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

    const marqueeRect = view.marquee.getBoundingClientRect();
    view.marquee.classList.remove("visible");

    const rect = {
      left: marqueeRect.left,
      top: marqueeRect.top,
      right: marqueeRect.right,
      bottom: marqueeRect.bottom,
    };

    if (isTinyDrag(rect, 5)) {
      if (!shiftAtStart) {
        actions.clearSelection();
        if (clickedTrackId) actions.setActiveTrack(clickedTrackId);
      }
      return;
    }

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
