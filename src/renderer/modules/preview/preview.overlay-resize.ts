import { on } from "@core/Dom";
import * as actions from "@state/actions";
import { appStore } from "@state/appStore";
import { getClipById } from "@state/selectors";
import { DEFAULT_CLIP_TRANSFORM } from "@shared/types/timeline";
import { refreshOverlayFromDom } from "./preview.selection-overlay";
import type { PreviewView } from "./preview.view";

/* ============================================================
   OVERLAY RESIZE
   ------------------------------------------------------------
   Drag corner handle → scale uniform around center.
   Aktif saat paused. Commit 1 history entry saat mouseup.
   ============================================================ */

interface ResizeState {
  readonly clipId: string;
  readonly startScale: number;
  readonly startWidth: number;
  readonly startX: number;
  readonly startY: number;
  readonly signX: 1 | -1;
  readonly signY: 1 | -1;
  moved: boolean;
  lastScale: number;
}

export function attachOverlayResize(view: PreviewView): () => void {
  let resize: ResizeState | null = null;

  const onMouseDown = (ev: MouseEvent): void => {
    if (ev.button !== 0) return;

    const state = appStore.getState();
    if (state.playback.playing) return;

    const target = ev.target;
    if (!(target instanceof Element)) return;

    const handleEl = target.closest<HTMLElement>(".preview-handle");
    if (!handleEl) return;

    const selectedId = state.selection.selectedClipIds[0];
    if (!selectedId) return;

    const clip = getClipById(state, selectedId);
    if (!clip) return;

    const track = state.project.sequence.tracks.find((t) =>
      t.clips.some((c) => c.id === selectedId),
    );
    if (!track || track.locked) return;

    const width = parseFloat(view.selectionOverlay.style.width) || 0;
    if (width <= 0) return;

    const handlePos = handleEl.dataset["handle"];
    const signX: 1 | -1 = handlePos === "nw" || handlePos === "sw" ? -1 : 1;
    const signY: 1 | -1 = handlePos === "nw" || handlePos === "ne" ? -1 : 1;

    const t = clip.transform ?? DEFAULT_CLIP_TRANSFORM;

    resize = {
      clipId: selectedId,
      startScale: t.scale,
      startWidth: width,
      startX: ev.clientX,
      startY: ev.clientY,
      signX,
      signY,
      moved: false,
      lastScale: t.scale,
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.userSelect = "none";
    ev.preventDefault();
    ev.stopPropagation();
  };

  const onMouseMove = (ev: MouseEvent): void => {
    if (!resize) return;

    const dx = ev.clientX - resize.startX;
    const dy = ev.clientY - resize.startY;

    if (!resize.moved && Math.hypot(dx, dy) < 3) return;
    resize.moved = true;

    const delta = (dx * resize.signX + dy * resize.signY) / 2;
    const newWidth = resize.startWidth + 2 * delta;
    if (newWidth <= 0) return;

    const newScale = Math.max(
      10,
      Math.min(200, resize.startScale * (newWidth / resize.startWidth)),
    );
    resize.lastScale = newScale;

    /* DOM-only update (smooth during resize). */
    const clipEl = view.compositeLayer.querySelector<HTMLElement>(
      `.preview-clip[data-clip-id="${resize.clipId}"]`,
    );
    if (!clipEl) return;

    const clip = getClipById(appStore.getState(), resize.clipId);
    if (!clip) return;
    const t = clip.transform ?? DEFAULT_CLIP_TRANSFORM;
    const xPct = t.positionX / 2;
    const yPct = t.positionY / 2;
    clipEl.style.transform = `translate(${xPct}%, ${yPct}%) rotate(${t.rotation}deg) scale(${newScale / 100})`;

    refreshOverlayFromDom(view);
  };

  const onMouseUp = (): void => {
    if (!resize) return;
    const { clipId, startScale, lastScale, moved } = resize;

    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.body.style.userSelect = "";
    resize = null;

    if (!moved) return;
    if (Math.abs(lastScale - startScale) < 0.5) return;

    actions.setClipTransformBulk(clipId, {
      scale: Math.round(lastScale * 10) / 10,
    });
  };

  return on(view.selectionOverlay, "mousedown", onMouseDown as EventListener);
}
