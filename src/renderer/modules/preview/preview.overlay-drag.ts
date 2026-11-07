import { on } from "@core/Dom";
import * as actions from "@state/actions";
import { appStore } from "@state/appStore";
import { getClipById } from "@state/selectors";
import { DEFAULT_CLIP_TRANSFORM } from "@shared/types/timeline";
import { pixelDeltaToPosition, clampPosition } from "./overlay-drag.logic";
import { refreshOverlayFromDom } from "./preview.selection-overlay";
import type { PreviewView } from "./preview.view";

/* ============================================================
   OVERLAY DRAG
   ------------------------------------------------------------
   Drag selection box → ubah positionX/positionY. Aktif saat
   paused (playing = no-op). Commit 1 history entry saat mouseup.
   ============================================================ */

interface DragState {
  readonly clipId: string;
  readonly element: HTMLElement;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly startPositionX: number;
  readonly startPositionY: number;
  readonly monitorWidth: number;
  readonly monitorHeight: number;
  readonly rotation: number;
  readonly scale: number;
  moved: boolean;
  lastX: number;
  lastY: number;
}

export function attachOverlayDrag(view: PreviewView): () => void {
  let drag: DragState | null = null;

  const onMouseDown = (ev: MouseEvent): void => {
    if (ev.button !== 0) return;

    const state = appStore.getState();
    if (state.playback.playing) return;

    const target = ev.target;
    if (!(target instanceof Element)) return;

    const clipEl = target.closest<HTMLElement>(".preview-clip.selected");
    if (!clipEl) return;

    const clipId = clipEl.dataset["clipId"];
    if (!clipId) return;

    const clip = getClipById(state, clipId);
    if (!clip) return;

    const track = state.project.sequence.tracks.find((t) =>
      t.clips.some((c) => c.id === clipId),
    );
    if (!track || track.locked) return;

    const monitorRect = view.monitor.getBoundingClientRect();
    if (monitorRect.width <= 0 || monitorRect.height <= 0) return;

    const t = clip.transform ?? DEFAULT_CLIP_TRANSFORM;

    drag = {
      clipId,
      element: clipEl,
      startClientX: ev.clientX,
      startClientY: ev.clientY,
      startPositionX: t.positionX,
      startPositionY: t.positionY,
      monitorWidth: monitorRect.width,
      monitorHeight: monitorRect.height,
      rotation: t.rotation,
      scale: t.scale,
      moved: false,
      lastX: t.positionX,
      lastY: t.positionY,
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    ev.preventDefault();
    ev.stopPropagation();
  };

  const onMouseMove = (ev: MouseEvent): void => {
    if (!drag) return;

    const dx = ev.clientX - drag.startClientX;
    const dy = ev.clientY - drag.startClientY;

    if (!drag.moved && Math.hypot(dx, dy) < 3) return;
    drag.moved = true;

    const delta = pixelDeltaToPosition(
      dx,
      dy,
      drag.monitorWidth,
      drag.monitorHeight,
    );
    const newX = clampPosition(drag.startPositionX + delta.x);
    const newY = clampPosition(drag.startPositionY + delta.y);
    drag.lastX = newX;
    drag.lastY = newY;

    /* DOM-only update (smooth during drag). */
    const xPct = newX / 2;
    const yPct = newY / 2;
    drag.element.style.transform = `translate(${xPct}%, ${yPct}%) rotate(${drag.rotation}deg) scale(${drag.scale / 100})`;
    refreshOverlayFromDom(view);
  };

  const onMouseUp = (): void => {
    if (!drag) return;
    const { clipId, startPositionX, startPositionY, lastX, lastY, moved } =
      drag;

    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    drag = null;

    if (!moved) return;
    if (
      Math.abs(lastX - startPositionX) < 0.05 &&
      Math.abs(lastY - startPositionY) < 0.05
    ) {
      return;
    }

    actions.setClipTransformBulk(clipId, {
      positionX: Math.round(lastX * 10) / 10,
      positionY: Math.round(lastY * 10) / 10,
    });
  };

  return on(view.compositeLayer, "mousedown", onMouseDown as EventListener);
}
