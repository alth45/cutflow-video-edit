import { on } from "@core/Dom";
import * as actions from "@state/actions";
import { appStore } from "@state/appStore";
import { getClipById } from "@state/selectors";
import { DEFAULT_TEXT_STYLE } from "@shared/types/timeline";
import { openTextEditor } from "./text-editor.module";
import type { TimelineView } from "./timeline.view";

/* ============================================================
   TEXT TOOL (create)
   ------------------------------------------------------------
   Klik di empty area video track → buat text clip di posisi klik.
   Tool tetap aktif (multi-place). Audio track = no-op.
   ============================================================ */
export function attachTextTool(view: TimelineView): () => void {
  const onMouseDown = (ev: MouseEvent): void => {
    if (ev.button !== 0) return;

    const state = appStore.getState();
    if (state.ui.timeline.activeTool !== "text") return;

    const target = ev.target;
    if (!(target instanceof Element)) return;

    if (target.closest(".clip")) return;
    if (target.closest(".clip-trim")) return;
    if (target.closest(".transition-box")) return;

    const trackEl = target.closest<HTMLElement>(".track");
    if (!trackEl) return;

    const trackId = trackEl.dataset["trackId"];
    if (!trackId) return;

    const track = state.project.sequence.tracks.find((t) => t.id === trackId);
    if (!track || track.locked) return;
    if (track.kind !== "video") return;

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
   TEXT CLIP EDIT (double-click)
   ------------------------------------------------------------
   Double-click pada text clip → buka modal → save content.
   Hanya aktif di pointer tool.
   ============================================================ */
export async function handleTextClipDblClick(
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
    initialStyle: clip.source.style ?? DEFAULT_TEXT_STYLE,
    title: "Edit text clip",
    placeholder: "Enter text…",
  });

  if (result === null) return;

  actions.updateTextClip(clipId, result.content, result.style);

  view.tlScroll.focus();
}
