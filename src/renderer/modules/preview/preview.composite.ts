import type { AppState } from "@shared/types/state";
import { getActiveClipsAtTime, sequenceHasAnyClip } from "./preview.logic";
import { createClipVisual, updateClipVisual } from "./preview.clip-visual";
import { updateSelectionOverlay } from "./preview.selection-overlay";
import type { PreviewView } from "./preview.view";
import type { AudioEngine } from "./audio-engine";

/* ============================================================
   COMPOSITE RENDERER
   ------------------------------------------------------------
   Diff-based: hanya add/remove/update clip visuals yang
   berubah. Video di-cache per clipId (hindari decode restart).
   ============================================================ */
export function renderComposite(
  view: PreviewView,
  state: AppState,
  videoCache: Map<string, HTMLVideoElement>,
  renderedClips: Map<string, HTMLElement>,
  audioEngine: AudioEngine,
): void {
  const composite = view.compositeLayer;
  const timeSec = state.playback.currentTimeSec;
  const playing = state.playback.playing;

  /* Empty state toggle: hide `.monitor-inner` saat ada clips. */
  view.monitor.classList.toggle("has-content", sequenceHasAnyClip(state));

  const active = getActiveClipsAtTime(state, timeSec);
  const activeIds = new Set(active.map((a) => a.clip.id));

  /* Remove clips no longer active */
  for (const [clipId, el] of renderedClips) {
    if (!activeIds.has(clipId)) {
      el.remove();
      renderedClips.delete(clipId);

      const video = videoCache.get(clipId);
      if (video) {
        video.pause();
        audioEngine.detach(video);
        video.removeAttribute("src");
        video.load();
        videoCache.delete(clipId);
      }
    }
  }

  /* Render/update active clips (bottom → top paint order) */
  for (const info of active) {
    if (info.visualType === "unsupported") continue;

    let el = renderedClips.get(info.clip.id);
    if (!el) {
      const created = createClipVisual(info, state, videoCache, audioEngine);
      if (!created) continue;
      composite.append(created);
      renderedClips.set(info.clip.id, created);
      el = created;
    }
    updateClipVisual(el, info, playing, state, audioEngine);
  }

  /* Sync .selected class on active clip overlays */
  const activeSelectedId = state.selection.selectedClipIds[0] ?? null;
  for (const [clipId, el] of renderedClips) {
    el.classList.toggle("selected", clipId === activeSelectedId);
  }

  /* Fade overlay (dip-to-white dkk) */
  updateFadeOverlay(view, state);
  /* Position selection overlay at selected clip bounds */
  updateSelectionOverlay(view, renderedClips);
}

/* ============================================================
   FADE OVERLAY — dip-to-white dkk
   ============================================================ */
function updateFadeOverlay(view: PreviewView, state: AppState): void {
  const timeSec = state.playback.currentTimeSec;
  let maxOpacity = 0;
  let color = "rgba(0,0,0,0)";

  for (const track of state.project.sequence.tracks) {
    for (const tr of track.transitions) {
      if (tr.kind !== "dip-to-white") continue;

      const beforeClip = track.clips.find((c) => c.id === tr.beforeClipId);
      if (!beforeClip) continue;

      const junction = beforeClip.startSec + beforeClip.durationSec;
      const half = tr.durationSec / 2;
      if (timeSec < junction - half || timeSec >= junction + half) continue;

      const p = (timeSec - (junction - half)) / tr.durationSec;
      const op = 1 - Math.abs(p - 0.5) * 2;
      if (op > maxOpacity) {
        maxOpacity = op;
        color = `rgba(255, 255, 255, ${op.toFixed(2)})`;
      }
    }
  }

  view.fadeOverlay.style.background = color;
  view.fadeOverlay.style.opacity = maxOpacity > 0 ? "1" : "0";
}
