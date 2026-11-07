import { on } from "@core/Dom";
import { appStore } from "@state/appStore";
import type { TimelineView } from "./timeline.view";

/* ============================================================
   HAND PAN
   ------------------------------------------------------------
   Drag di tl-scroll saat hand tool aktif = pan viewport.
   Mouse delta inversif (grab-and-drag pattern).
   ============================================================ */
export function attachHandPan(view: TimelineView): () => void {
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
