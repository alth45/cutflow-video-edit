import { setChildren } from "@core/Dom";
import { setIconPath } from "@core/icons";
import { appStore } from "@state/appStore";
import { formatTimecode } from "./playback.logic";
import { createPlaybackTicker } from "./playback.ticker";
import { attachPreviewController } from "./preview.controller";
import { renderComposite } from "./preview.composite";
import { syncAudio } from "./preview.audio-sync";
import { attachOverlayDrag } from "./preview.overlay-drag";
import { attachOverlayResize } from "./preview.overlay-resize";
import { renderPreview, type PreviewView } from "./preview.view";
import { AudioEngine } from "./audio-engine";

/* ============================================================
   PREVIEW MODULE — ORCHESTRATOR
   ------------------------------------------------------------
   Thin entry point. Wiring:
   - View (renderPreview) → bootstrap shell.
   - Subscriber → re-render composite + audio + meta on change.
   - Handlers (drag/resize) attached to sub-elements.
   - Cleanup → dispose ticker, caches, audio engine.
   ============================================================ */

export function mountPreview(container: HTMLElement): () => void {
  const initial = appStore.getState();
  const view = renderPreview(initial);
  setChildren(container, view.root);

  const ticker = createPlaybackTicker();
  if (initial.playback.playing) ticker.start();

  /* Per-mount caches */
  const videoCache = new Map<string, HTMLVideoElement>();
  const renderedClips = new Map<string, HTMLElement>();
  const audioCache = new Map<string, HTMLAudioElement>();
  const audioEngine = new AudioEngine();

  const unsubscribe = appStore.subscribe((state, prev) => {
    /* Timecode display */
    if (state.playback.currentTimeSec !== prev.playback.currentTimeSec) {
      view.tcCurrent.textContent = formatTimecode(
        state.playback.currentTimeSec,
        state.project.sequence.fps,
      );
    }

    /* Play state (overlay + ticker) */
    if (state.playback.playing !== prev.playback.playing) {
      const playing = state.playback.playing;
      view.playOverlay.classList.toggle("hide", playing);
      setIconPath(view.playIconSvg, playing ? "pause" : "play");
      view.btnPlay.setAttribute("aria-label", playing ? "Pause" : "Play");
      if (playing) ticker.start();
      else ticker.stop();
    }

    /* Volume mute state → icon + tooltip */
    if (state.playback.muted !== prev.playback.muted) {
      syncVolumeButton(view, state.playback.muted);
    }

    /* Fullscreen state → icon + tooltip */
    if (
      state.ui.layout.previewFullscreen !== prev.ui.layout.previewFullscreen
    ) {
      syncFullscreenButton(view, state.ui.layout.previewFullscreen);
    }

    /* Sequence meta (duration, fps) */
    if (state.project.sequence !== prev.project.sequence) {
      const seq = state.project.sequence;
      view.tcDuration.textContent = formatTimecode(seq.durationSec, seq.fps);
      view.seqMeta.textContent = `${seq.width} × ${seq.height} · ${seq.fps} fps`;
    }

    /* Composite re-render triggers */
    const timeChanged =
      state.playback.currentTimeSec !== prev.playback.currentTimeSec;
    const seqChanged = state.project.sequence !== prev.project.sequence;
    const playStateChanged = state.playback.playing !== prev.playback.playing;
    const selectionChanged =
      state.selection.selectedClipIds !== prev.selection.selectedClipIds;

    if (timeChanged || seqChanged || playStateChanged || selectionChanged) {
      renderComposite(view, state, videoCache, renderedClips, audioEngine);
      syncAudio(state, state.playback.playing, audioCache, audioEngine);
    }
  });

  /* Initial render */
  renderComposite(view, initial, videoCache, renderedClips, audioEngine);
  syncAudio(initial, false, audioCache, audioEngine);

  /* Attach handlers */
  const detachDrag = attachOverlayDrag(view);
  const detachResize = attachOverlayResize(view);
  const detach = attachPreviewController(view);

  return () => {
    detachDrag();
    detachResize();
    detach();
    unsubscribe();
    ticker.stop();

    for (const video of videoCache.values()) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    videoCache.clear();

    for (const audio of audioCache.values()) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    audioCache.clear();

    renderedClips.clear();
    audioEngine.dispose();
    container.replaceChildren();
  };
}

/* ============================================================
   HEADER BUTTON SYNC
   ============================================================ */

function syncVolumeButton(view: PreviewView, muted: boolean): void {
  setIconPath(view.volumeIconSvg, muted ? "volume-muted" : "volume");
  view.btnVolume.classList.toggle("active", muted);
  view.btnVolume.setAttribute("title", muted ? "Unmute" : "Mute");
}

function syncFullscreenButton(view: PreviewView, active: boolean): void {
  setIconPath(view.fullscreenIconSvg, active ? "minimize" : "fullscreen");
  view.btnFullscreen.classList.toggle("active", active);
  view.btnFullscreen.setAttribute(
    "title",
    active ? "Exit fullscreen" : "Fullscreen",
  );
}
