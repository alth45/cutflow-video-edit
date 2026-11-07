import { appStore } from "@state/appStore";
import type { PreviewView } from "./preview.view";

/* ============================================================
   SELECTION OVERLAY SYNC
   ------------------------------------------------------------
   Overlay terpisah di `.monitor` (di luar transform chain clip).
   Handles selalu axis-aligned, tidak ikut rotate/scale clip.
   ============================================================ */

export function updateSelectionOverlay(
  view: PreviewView,
  renderedClips: Map<string, HTMLElement>,
): void {
  const state = appStore.getState();
  const selectedId = state.selection.selectedClipIds[0];

  if (!selectedId) {
    view.selectionOverlay.style.display = "none";
    return;
  }

  const clipEl = renderedClips.get(selectedId);
  if (!clipEl) {
    view.selectionOverlay.style.display = "none";
    return;
  }

  const content = clipEl.querySelector<HTMLElement>(".preview-clip-content");
  if (!content) {
    view.selectionOverlay.style.display = "none";
    return;
  }

  const monitorRect = view.monitor.getBoundingClientRect();
  const contentRect = content.getBoundingClientRect();

  if (contentRect.width <= 0 || contentRect.height <= 0) {
    view.selectionOverlay.style.display = "none";
    return;
  }

  view.selectionOverlay.style.display = "block";
  view.selectionOverlay.style.left = `${contentRect.left - monitorRect.left}px`;
  view.selectionOverlay.style.top = `${contentRect.top - monitorRect.top}px`;
  view.selectionOverlay.style.width = `${contentRect.width}px`;
  view.selectionOverlay.style.height = `${contentRect.height}px`;
}

/** Sync overlay dari DOM tanpa state update (dipakai selama drag/resize). */
export function refreshOverlayFromDom(view: PreviewView): void {
  const selectedId = appStore.getState().selection.selectedClipIds[0];
  if (!selectedId) return;

  const clipEl = view.compositeLayer.querySelector<HTMLElement>(
    `.preview-clip[data-clip-id="${selectedId}"]`,
  );
  if (!clipEl) return;
  const content = clipEl.querySelector<HTMLElement>(".preview-clip-content");
  if (!content) return;

  const monitorRect = view.monitor.getBoundingClientRect();
  const contentRect = content.getBoundingClientRect();
  if (contentRect.width <= 0 || contentRect.height <= 0) return;

  const overlay = view.selectionOverlay;
  overlay.style.left = `${contentRect.left - monitorRect.left}px`;
  overlay.style.top = `${contentRect.top - monitorRect.top}px`;
  overlay.style.width = `${contentRect.width}px`;
  overlay.style.height = `${contentRect.height}px`;
}
