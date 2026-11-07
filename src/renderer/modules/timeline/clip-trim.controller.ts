import { on } from "@core/Dom";
import * as actions from "@state/actions";
import { appStore } from "@state/appStore";
import { getMaxClipDuration } from "@state/selectors";
import { computeTrimDuration } from "./clip-trim.logic";
import type { TimelineView } from "./timeline.view";

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

export function attachClipTrim(view: TimelineView): () => void {
  let trim: TrimState | null = null;

  const onMouseDown = (ev: MouseEvent): void => {
    if (ev.button !== 0) return;

    const state = appStore.getState();
    const tool = state.ui.timeline.activeTool;
    if (tool === "razor" || tool === "hand" || tool === "text") return;

    const target = ev.target;
    if (!(target instanceof Element)) return;

    const handle = target.closest<HTMLElement>(".clip-trim-right");
    if (!handle) return;

    const clipEl = handle.closest<HTMLElement>(".clip");
    if (!clipEl) return;
    const clipId = clipEl.dataset["clipId"];
    if (!clipId) return;

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
