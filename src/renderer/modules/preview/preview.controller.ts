import { on } from "@core/Dom";
import * as actions from "@state/actions";
import { appStore } from "@state/appStore";
import type { PreviewView } from "./preview.view";

/* ============================================================
   PREVIEW CONTROLLER
   ------------------------------------------------------------
   Event listeners untuk transport & monitor. Semua memanggil
   actions → subscriber di module yang update UI.
   ============================================================ */

export function attachPreviewController(view: PreviewView): () => void {
  const cleanups: Array<() => void> = [];

  /* Play / pause via transport button */
  cleanups.push(on(view.btnPlay, "click", () => actions.togglePlay()));

  /* Play / pause via big overlay button — stopPropagation agar
     tidak juga trigger overlay click handler di bawah. */
  cleanups.push(
    on(view.btnBigPlay, "click", (ev) => {
      ev.stopPropagation();
      actions.togglePlay();
    }),
  );

  /* Click overlay area (di luar tombol) — hanya toggle kalau
     belum playing (kalau playing, overlay hidden & pointer-events
     none, tapi guard ini pertahanan kalau ada bug). */
  cleanups.push(
    on(view.playOverlay, "click", () => {
      if (!appStore.getState().playback.playing) actions.togglePlay();
    }),
  );

  /* Transport: jump & step */
  cleanups.push(on(view.btnStart, "click", () => actions.goToStart()));
  cleanups.push(on(view.btnEnd, "click", () => actions.goToEnd()));
  cleanups.push(on(view.btnStepBack, "click", () => actions.stepFrame(-1)));
  cleanups.push(on(view.btnStepFwd, "click", () => actions.stepFrame(1)));

  /* ---- Volume (master mute) ---- */
  cleanups.push(
    on(view.btnVolume, "click", () => actions.togglePlaybackMuted()),
  );

  /* ---- Fullscreen (preview-only) ---- */
  cleanups.push(
    on(view.btnFullscreen, "click", () => actions.togglePreviewFullscreen()),
  );

  /* Global keyboard: Space untuk play/pause.
     Skip saat fokus di input/textarea/contenteditable —
     user sedang mengetik, tidak ingin mengganggu.
     `preventDefault()` mencegah space menggeser halaman atau
     meng-aktivasi button yang sedang fokus (mencegah double toggle). */

  return () => cleanups.forEach((fn) => fn());
}
