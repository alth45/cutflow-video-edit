import { el, clear } from "@core/Dom";
import { createIcon } from "@core/icons";
import { ZOOM } from "@shared/constants";
import { getClipsInTrack } from "@state/selectors";
import { computeRulerLabels, timeToProgress } from "./timeline.logic";
import { generateWaveform } from "./waveform.logic";
import type { AppState } from "@shared/types/state";
import type { Clip, Track } from "@shared/types/timeline";
import { canTrimClip } from "./clip-trim.logic";
import { detectJunctions } from "./clip-junction.logic";
/* ============================================================
   TIMELINE VIEW
   ============================================================ */

export interface TimelineView {
  readonly root: HTMLElement;
  readonly zoomInput: HTMLInputElement;
  readonly zoomVal: HTMLElement;
  readonly snapBtn: HTMLButtonElement;
  readonly trackHeadsContainer: HTMLElement;
  readonly tlScroll: HTMLElement;
  readonly tlContent: HTMLElement;
  readonly ruler: HTMLElement;
  readonly tracksContainer: HTMLElement;
  readonly playhead: HTMLElement;
  readonly snapGuide: HTMLElement;
  readonly dropGhost: HTMLElement;
  readonly marquee: HTMLElement;
}

export function renderTimeline(state: AppState): TimelineView {
  const seq = state.project.sequence;

  const root = el("div");
  root.style.cssText =
    "display:flex;flex-direction:column;height:100%;min-height:0;";

  /* ---------- Toolbar ---------- */
  const toolbar = el("div", { className: "tl-toolbar" });

  const toolsLeft = el("div", { className: "tl-tools" });
  const toolDefs = [
    {
      id: "pointer" as const,
      title: "Selection tool",
      icon: "pointer" as const,
    },
    { id: "razor" as const, title: "Razor tool", icon: "razor" as const },
    { id: "hand" as const, title: "Hand tool", icon: "hand" as const },
    { id: "text" as const, title: "Text tool", icon: "text" as const },
  ];

  for (const t of toolDefs) {
    const isActive = state.ui.timeline.activeTool === t.id;
    const btn = el("button", {
      className: `icon-btn${isActive ? " active" : ""}`,
      attrs: { title: t.title },
    });
    btn.dataset["tool"] = t.id;
    btn.append(createIcon(t.icon));
    toolsLeft.append(btn);
  }

  toolsLeft.append(el("span", { className: "divider" }));

  const undoBtn = el("button", {
    className: "icon-btn",
    attrs: { title: "Undo" },
  });
  undoBtn.append(createIcon("undo"));
  const redoBtn = el("button", {
    className: "icon-btn",
    attrs: { title: "Redo" },
  });
  redoBtn.append(createIcon("redo"));
  toolsLeft.append(undoBtn, redoBtn);

  const toolsRight = el("div", { className: "tl-tools right" });
  const snapBtn = el("button", {
    className: `icon-btn${state.ui.timeline.snapEnabled ? " active" : ""}`,
    attrs: { title: "Toggle snapping" },
  });
  snapBtn.append(createIcon("magnet"));

  const zoomOutIcon = createIcon("zoom-out");
  zoomOutIcon.style.cssText = "width:14px;height:14px;";
  zoomOutIcon.classList.add("muted");

  const zoomInput = el("input", {
    id: "zoom",
    attrs: {
      type: "range",
      min: String(ZOOM.MIN),
      max: String(ZOOM.MAX),
      step: String(ZOOM.STEP),
      value: String(state.ui.timeline.zoom),
    },
  });
  zoomInput.style.setProperty(
    "--val",
    `${((state.ui.timeline.zoom - ZOOM.MIN) / (ZOOM.MAX - ZOOM.MIN)) * 100}%`,
  );

  const zoomInIcon = createIcon("zoom-in");
  zoomInIcon.style.cssText = "width:14px;height:14px;";
  zoomInIcon.classList.add("muted");

  const zoomVal = el("span", {
    className: "zoom-val",
    text: `${Math.round(state.ui.timeline.zoom * 100)}%`,
  });

  toolsRight.append(
    snapBtn,
    el("span", { className: "divider" }),
    zoomOutIcon,
    zoomInput,
    zoomInIcon,
    zoomVal,
  );

  toolbar.append(toolsLeft, toolsRight);

  /* ---------- Body: heads + scroll ---------- */
  const body = el("div", { className: "tl-body" });

  const trackHeadsContainer = el("div", { className: "track-heads" });
  trackHeadsContainer.append(
    el("div", { className: "th-spacer", text: "Tracks" }),
  );

  const tlScroll = el("div", { className: "tl-scroll" });
  const tlContent = el("div", { className: "tl-content" });
  tlContent.style.setProperty("--zoom", String(state.ui.timeline.zoom));
  tlContent.style.setProperty(
    "--p",
    String(timeToProgress(state.playback.currentTimeSec, seq.durationSec)),
  );

  const ruler = el("div", { className: "ruler" });
  const tracksContainer = el("div", { className: "tracks" });
  const playhead = el("div", { className: "playhead" });
  const snapGuide = el("div", { className: "snap-guide" });
  const dropGhost = el("div", { className: "drop-ghost" });
  const marquee = el("div", { className: "marquee" });

  tlContent.append(
    ruler,
    tracksContainer,
    playhead,
    snapGuide,
    dropGhost,
    marquee,
  );
  tlScroll.append(tlContent);
  body.append(trackHeadsContainer, tlScroll);

  root.append(toolbar, body);

  /* Render awal dynamic content */
  renderRulerInto(ruler, seq.durationSec);
  renderTrackHeads(trackHeadsContainer, state);
  renderTracks(tracksContainer, state);

  return {
    root,
    zoomInput,
    zoomVal,
    snapBtn,
    trackHeadsContainer,
    tlScroll,
    tlContent,
    ruler,
    tracksContainer,
    playhead,
    snapGuide,
    dropGhost,
    marquee,
  };
}

/* ============================================================
   DYNAMIC RENDERERS (dipanggil ulang oleh subscriber)
   ============================================================ */

export function renderRulerInto(ruler: HTMLElement, durationSec: number): void {
  clear(ruler);
  for (const lbl of computeRulerLabels(durationSec)) {
    const el2 = el("span", { className: "rl", text: lbl.label });
    el2.style.left = `${lbl.percent * 100}%`;
    ruler.append(el2);
  }
}

export function renderTrackHeads(
  container: HTMLElement,
  state: AppState,
): void {
  clear(container);
  container.append(el("div", { className: "th-spacer", text: "Tracks" }));

  for (const track of state.project.sequence.tracks) {
    const th = el("div", { className: "th" });
    th.dataset["trackId"] = track.id;

    const badge = el("span", { className: "badge" });
    badge.append(createIcon(track.kind === "video" ? "film" : "music"));
    th.append(badge, document.createTextNode(track.name));

    const btns = el("div", { className: "th-btns" });

    const eyeBtn = el("button", {
      className: `icon-btn${track.hidden ? " active" : ""}`,
      attrs: { title: track.hidden ? "Show track" : "Hide track" },
    });
    eyeBtn.append(createIcon("eye"));

    const lockBtn = el("button", {
      className: `icon-btn${track.locked ? " active" : ""}`,
      attrs: { title: track.locked ? "Unlock track" : "Lock track" },
    });
    lockBtn.append(createIcon("lock"));

    eyeBtn.dataset["toggle"] = "hidden";
    lockBtn.dataset["toggle"] = "locked";

    btns.append(eyeBtn, lockBtn);
    th.append(btns);
    container.append(th);
  }
}

export function renderTracks(container: HTMLElement, state: AppState): void {
  clear(container);

  const selectedTransitionId = state.selection.selectedTransitionId;
  const dur = state.project.sequence.durationSec;

  for (const track of state.project.sequence.tracks) {
    const trackEl = el("div", {
      className: `track${track.kind === "video" ? " video" : ""}`,
    });
    trackEl.dataset["trackId"] = track.id;

    const selected = new Set(state.selection.selectedClipIds);
    for (const clip of getClipsInTrack(track)) {
      trackEl.append(renderClip(clip, state, selected.has(clip.id)));
    }

    /* Transitions di junction */
    for (const junction of detectJunctions(track)) {
      const isSelected =
        junction.existingTransition !== null &&
        junction.existingTransition.id === selectedTransitionId;
      trackEl.append(
        renderTransitionBox(junction, dur, isSelected, track.locked),
      );
    }

    container.append(trackEl);
  }
}

function renderClip(
  clip: Clip,
  state: AppState,
  isSelected: boolean,
): HTMLElement {
  const dur = state.project.sequence.durationSec;
  const leftPct = (clip.startSec / dur) * 100;
  const widthPct = (clip.durationSec / dur) * 100;

  const el2 = el("div", {
    className: `clip ${clip.kind} c-${clip.colorToken}${isSelected ? " selected" : ""}`,
  });
  el2.style.left = `${leftPct}%`;
  el2.style.width = `${widthPct}%`;
  el2.dataset["clipId"] = clip.id;

  const label = el("div", { className: "clip-label" });
  const iconName =
    clip.kind === "text" ? "text" : clip.kind === "audio" ? "music" : "film";

  const labelText = el("span", {
    className: "clip-label-text",
    text: clip.name,
  });
  label.append(createIcon(iconName), labelText);
  el2.append(label);

  if (clip.kind === "audio") {
    const wave = el("div", { className: "wave" });
    for (const h of generateWaveform(clip.id)) {
      const bar = el("i");
      bar.style.height = `${h}%`;
      wave.append(bar);
    }
    el2.append(wave);
  }

  /* Trim handle di kanan */
  if (canTrimClip(clip)) {
    el2.append(el("div", { className: "clip-trim clip-trim-right" }));
  }

  return el2;
}

/* ============================================================
   TRANSITION BOX
   ------------------------------------------------------------
   Kotak kecil di junction antara dua clip. Empty = placeholder
   (klik untuk add). Filled = transition active (klik untuk
   select).
   ============================================================ */

function renderTransitionBox(
  junction: ReturnType<typeof detectJunctions>[number],
  durationSec: number,
  isSelected: boolean,
  trackLocked: boolean,
): HTMLElement {
  const hasTransition = junction.existingTransition !== null;
  const leftPct = (junction.timeSec / durationSec) * 100;

  const classes = ["transition-box"];
  classes.push(hasTransition ? "filled" : "empty");
  if (isSelected) classes.push("selected");
  if (trackLocked) classes.push("locked");

  const box = el("div", { className: classes.join(" ") });
  box.style.left = `${leftPct}%`;
  box.dataset["transitionId"] = junction.existingTransition?.id ?? "";
  box.dataset["beforeClipId"] = junction.beforeClip.id;
  box.dataset["afterClipId"] = junction.afterClip.id;
  box.dataset["trackId"] = "";
  box.setAttribute(
    "title",
    hasTransition
      ? `${junction.existingTransition!.kind} · ${junction.existingTransition!.durationSec}s`
      : "Click to add transition",
  );

  const icon = createIcon("blend");
  icon.style.width = "12px";
  icon.style.height = "12px";
  box.append(icon);

  return box;
}

export function updatePlayheadState(view: TimelineView, state: AppState): void {
  const p = timeToProgress(
    state.playback.currentTimeSec,
    state.project.sequence.durationSec,
  );
  view.tlContent.style.setProperty("--p", String(p));
}

export function updateSelection(view: TimelineView, state: AppState): void {
  const selected = new Set(state.selection.selectedClipIds);
  view.tracksContainer
    .querySelectorAll<HTMLElement>(".clip[data-clip-id]")
    .forEach((clipEl) => {
      const id = clipEl.dataset["clipId"];
      clipEl.classList.toggle("selected", !!id && selected.has(id));
    });
}

export function updateZoom(view: TimelineView, state: AppState): void {
  view.tlContent.style.setProperty("--zoom", String(state.ui.timeline.zoom));
  if (view.zoomInput.value !== String(state.ui.timeline.zoom)) {
    view.zoomInput.value = String(state.ui.timeline.zoom);
  }
  view.zoomInput.style.setProperty(
    "--val",
    `${((state.ui.timeline.zoom - ZOOM.MIN) / (ZOOM.MAX - ZOOM.MIN)) * 100}%`,
  );
  view.zoomVal.textContent = `${Math.round(state.ui.timeline.zoom * 100)}%`;
  view.snapBtn.classList.toggle("active", state.ui.timeline.snapEnabled);
}

export function updateActiveTool(view: TimelineView, state: AppState): void {
  const tool = state.ui.timeline.activeTool;
  view.root
    .querySelectorAll<HTMLButtonElement>(
      ".tl-tools:not(.right) .icon-btn[data-tool]",
    )
    .forEach((btn) => {
      btn.classList.toggle("active", btn.dataset["tool"] === tool);
    });
  view.tlScroll.classList.toggle("razor-mode", tool === "razor");
  view.tlScroll.classList.toggle("hand-mode", tool === "hand"); // ← TAMBAH
}
