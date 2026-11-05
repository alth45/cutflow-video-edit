import { el } from "@core/Dom";
import { createIcon } from "@core/icons";
import { formatTimecode } from "./playback.logic";
import type { AppState } from "@shared/types/state";

/* ============================================================
   PREVIEW VIEW
   ------------------------------------------------------------
   Render struktur preview: head, stage (monitor + scene +
   safe-area + play-overlay), transport (current | controls |
   duration).

   Mengembalikan references untuk controller & subscriber.
   ============================================================ */

export interface PreviewView {
  readonly root: HTMLElement;
  readonly seqMeta: HTMLElement;
  readonly monitor: HTMLElement;
  readonly compositeLayer: HTMLElement;
  readonly selectionOverlay: HTMLElement;
  readonly playOverlay: HTMLElement;
  readonly btnPlay: HTMLButtonElement;
  readonly playIconSvg: SVGElement;
  readonly btnBigPlay: HTMLButtonElement;
  readonly btnStart: HTMLButtonElement;
  readonly btnStepBack: HTMLButtonElement;
  readonly btnStepFwd: HTMLButtonElement;
  readonly btnEnd: HTMLButtonElement;
  readonly tcCurrent: HTMLElement;
  readonly tcDuration: HTMLElement;
}

export function renderPreview(state: AppState): PreviewView {
  const seq = state.project.sequence;

  const root = el("div");
  root.style.cssText =
    "display:flex;flex-direction:column;height:100%;min-height:0;";

  /* ---------- Head ---------- */
  const head = el("div", { className: "preview-head" });
  const seqTitle = el("div", { className: "seq-title" });
  seqTitle.append(
    document.createTextNode(seq.name),
    el("span", { className: "dot" }),
  );
  const seqMeta = el("span", {
    className: "meta",
    text: `${seq.width} × ${seq.height} · ${seq.fps} fps`,
  });
  seqTitle.append(seqMeta);

  const headActions = el("div", { className: "actions" });
  const volBtn = el("button", {
    className: "icon-btn",
    attrs: { title: "Volume" },
  });
  volBtn.append(createIcon("volume"));
  const fsBtn = el("button", {
    className: "icon-btn",
    attrs: { title: "Fullscreen" },
  });
  fsBtn.append(createIcon("fullscreen"));
  headActions.append(volBtn, fsBtn);
  head.append(seqTitle, headActions);

  /* ---------- Stage + monitor ---------- */
  const stage = el("div", { className: "stage" });
  const monitor = el("div", { className: "monitor" });

  const inner = el("div", { className: "monitor-inner" });

  /* Empty state — tampil saat sequence tidak punya clip sama sekali. */
  const emptyState = el("div", { className: "monitor-empty" });

  const emptyLogo = el("div", { className: "monitor-empty-logo" });
  emptyLogo.append(createIcon("play"));

  const emptyName = el("div", {
    className: "monitor-empty-name",
    text: "CutFlow",
  });

  const emptyHint = el("div", {
    className: "monitor-empty-hint",
    text: "No media in timeline",
  });

  emptyState.append(emptyLogo, emptyName, emptyHint);
  inner.append(emptyState);

  const compositeLayer = el("div", { className: "monitor-composite" });

  /* Selection overlay + corner handles (F14u) */
  const selectionOverlay = el("div", {
    className: "preview-selection-overlay",
  });
  for (const pos of ["nw", "ne", "sw", "se"] as const) {
    const h = el("div", { className: `preview-handle preview-handle-${pos}` });
    h.dataset["handle"] = pos;
    selectionOverlay.append(h);
  }

  const safeArea = el("div", { className: "safe-area" });

  const playOverlay = el("div", {
    className: `play-overlay${state.playback.playing ? " hide" : ""}`,
  });
  const btnBigPlay = el("button", {
    attrs: { "aria-label": "Play" },
  });
  btnBigPlay.append(createIcon("play"));
  playOverlay.append(btnBigPlay);

  monitor.append(
    inner,
    compositeLayer,
    safeArea,
    playOverlay,
    selectionOverlay,
  );
  stage.append(monitor);

  /* ---------- Transport ---------- */
  const transport = el("div", { className: "transport" });

  /* Left: current time */
  const tcGroupLeft = el("div", { className: "tc-group" });
  tcGroupLeft.append(el("span", { className: "tc-label", text: "Current" }));
  const tcCurrent = el("span", {
    className: "tc live",
    text: formatTimecode(state.playback.currentTimeSec, seq.fps),
  });
  tcGroupLeft.append(tcCurrent);

  /* Center: controls */
  const controls = el("div", { className: "transport-controls" });

  const btnStart = el("button", {
    className: "icon-btn",
    attrs: { title: "Go to start" },
  });
  btnStart.append(createIcon("skip-start"));

  const btnStepBack = el("button", {
    className: "icon-btn",
    attrs: { title: "Step back" },
  });
  btnStepBack.append(createIcon("step-back"));

  const btnPlay = el("button", {
    className: "play-btn",
    attrs: { "aria-label": state.playback.playing ? "Pause" : "Play" },
  });
  const playIconSvg = createIcon(state.playback.playing ? "pause" : "play");
  btnPlay.append(playIconSvg);

  const btnStepFwd = el("button", {
    className: "icon-btn",
    attrs: { title: "Step forward" },
  });
  btnStepFwd.append(createIcon("step-fwd"));

  const btnEnd = el("button", {
    className: "icon-btn",
    attrs: { title: "Go to end" },
  });
  btnEnd.append(createIcon("skip-end"));

  controls.append(btnStart, btnStepBack, btnPlay, btnStepFwd, btnEnd);

  /* Right: duration */
  const tcGroupRight = el("div", { className: "tc-group right" });
  tcGroupRight.append(el("span", { className: "tc-label", text: "Duration" }));
  const tcDuration = el("span", {
    className: "tc",
    text: formatTimecode(seq.durationSec, seq.fps),
  });
  tcGroupRight.append(tcDuration);

  transport.append(tcGroupLeft, controls, tcGroupRight);

  root.append(head, stage, transport);

  return {
    root,
    seqMeta,
    monitor,
    compositeLayer,
    selectionOverlay,
    playOverlay,
    btnPlay,
    playIconSvg,
    btnBigPlay,
    btnStart,
    btnStepBack,
    btnStepFwd,
    btnEnd,
    tcCurrent,
    tcDuration,
  };
}
