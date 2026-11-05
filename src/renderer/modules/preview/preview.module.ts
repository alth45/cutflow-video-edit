import { setChildren } from "@core/Dom";
import { setIconPath } from "@core/icons";
import { appStore } from "@state/appStore";
import { renderPreview } from "./preview.view";
import { attachPreviewController } from "./preview.controller";
import { createPlaybackTicker } from "./playback.ticker";
import { formatTimecode } from "./playback.logic";

/* ============================================================
   PREVIEW MODULE — ENTRY
   ------------------------------------------------------------
   Orkestrasi view + controller + ticker + subscriber.
   ============================================================ */

export function mountPreview(container: HTMLElement): () => void {
  const initial = appStore.getState();
  const view = renderPreview(initial);
  setChildren(container, view.root);

  /* Ticker — auto-start jika state sudah playing (mis. re-mount) */
  const ticker = createPlaybackTicker();
  if (initial.playback.playing) ticker.start();

  /* Subscriber — re-render bagian yang berubah saja */
  const unsubscribe = appStore.subscribe((state, prev) => {
    /* Waktu playback berubah → update timecode text */
    if (state.playback.currentTimeSec !== prev.playback.currentTimeSec) {
      view.tcCurrent.textContent = formatTimecode(
        state.playback.currentTimeSec,
        state.project.sequence.fps,
      );
    }

    /* Playing state berubah → toggle overlay, swap icon, start/stop ticker */
    if (state.playback.playing !== prev.playback.playing) {
      const playing = state.playback.playing;

      view.playOverlay.classList.toggle("hide", playing);
      setIconPath(view.playIconSvg, playing ? "pause" : "play");
      view.btnPlay.setAttribute("aria-label", playing ? "Pause" : "Play");

      if (playing) ticker.start();
      else ticker.stop();
    }

    /* Sequence berubah (durasi/fps/name/meta) → update display statis.
       Untuk F9 ini tidak terjadi (no sequence editing), tapi handle
       untuk future load-project (F13) & settings. */
    if (state.project.sequence !== prev.project.sequence) {
      const seq = state.project.sequence;
      view.tcDuration.textContent = formatTimecode(seq.durationSec, seq.fps);
      view.seqMeta.textContent = `${seq.width} × ${seq.height} · ${seq.fps} fps`;
    }
  });

  /* Controller */
  const detach = attachPreviewController(view);

  return () => {
    detach();
    unsubscribe();
    ticker.stop();
    container.replaceChildren();
  };
}
