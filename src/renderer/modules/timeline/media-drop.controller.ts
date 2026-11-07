import { on } from "@core/Dom";
import * as actions from "@state/actions";
import { appStore } from "@state/appStore";
import { TIMELINE } from "@shared/constants";
import { SNAP_THRESHOLD_PX } from "./timeline.logic";
import { computeSnapTargets, snapToTargets } from "./clip-drag.logic";
import {
  clientXToTime,
  clampStart,
  buildClipFromAsset,
  DEFAULT_CLIP_DURATION_SEC,
  roundToTenth,
} from "./timeline-drop.logic";
import type { TimelineView } from "./timeline.view";

import { getDraggedAssetId } from "@modules/media/media-drag";
import { computeDefaultClipDuration } from "./timeline-drop.logic";

/* ============================================================
   MEDIA DROP
   ------------------------------------------------------------
   Drop dari media panel (thumbnail) ke track → buat clip baru.
   Ghost preview menunjukkan posisi + lebar clip sebelum drop.
   ============================================================ */
export function attachMediaDrop(view: TimelineView): () => void {
  const cleanups: Array<() => void> = [];

  const onDragOver = (ev: DragEvent): void => {
    const types = ev.dataTransfer?.types ?? [];
    const hasVideo = types.includes("application/x-cutflow-media-video");
    const hasAudio = types.includes("application/x-cutflow-media-audio");
    if (!hasVideo && !hasAudio) return;

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

    let startSec = clientXToTime(ev.clientX, tlRect, durationSec);

    /* Ghost pakai durasi aktual asset (audio/video pakai
   asset.durationSec, image fallback 5s). */
    const draggedId = getDraggedAssetId();
    const draggedAsset = draggedId
      ? state.project.mediaAssets.find((a) => a.id === draggedId)
      : null;
    const preferredDur = draggedAsset
      ? computeDefaultClipDuration(draggedAsset)
      : DEFAULT_CLIP_DURATION_SEC;

    const clipDur = Math.min(preferredDur, durationSec - startSec);
    startSec = clampStart(startSec, clipDur, durationSec);

    if (state.ui.timeline.snapEnabled && tlRect.width > 0) {
      const pxPerSec = tlRect.width / durationSec;
      const thresholdSec = SNAP_THRESHOLD_PX / pxPerSec;
      const targets = computeSnapTargets(
        [],
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
      return;
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
