import { el, clear } from "@core/Dom";
import { createIcon, type IconName } from "@core/icons";
import { ZOOM } from "@shared/constants";
import {
  KEYFRAMEABLE_KEYS,
  type Clip,
  type Track,
} from "@shared/types/timeline";
import type { AppState } from "@shared/types/state";
import { getClipsInTrack } from "@state/selectors";
import { computeRulerLabels, timeToProgress } from "./timeline.logic";
import { generateWaveform } from "./waveform.logic";
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
  readonly keyframeBtn: HTMLButtonElement;
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

/* ============================================================
   CONSTANTS
   ============================================================ */

const TOOL_DEFS = [
  { id: "pointer" as const, title: "Selection tool", icon: "pointer" as const },
  { id: "razor" as const, title: "Razor tool", icon: "razor" as const },
  { id: "hand" as const, title: "Hand tool", icon: "hand" as const },
  { id: "text" as const, title: "Text tool", icon: "text" as const },
];

const ZOOM_PERCENT_MIN = ZOOM.MIN;
const ZOOM_PERCENT_RANGE = ZOOM.MAX - ZOOM.MIN;

/* ============================================================
   MAIN RENDER
   ============================================================ */

export function renderTimeline(state: AppState): TimelineView {
  const seq = state.project.sequence;

  const root = el("div");
  root.style.cssText =
    "display:flex;flex-direction:column;height:100%;min-height:0;";

  /* Toolbar (extracted) */
  const { toolbar, zoomInput, zoomVal, snapBtn, keyframeBtn } =
    buildToolbar(state);

  /* Body: track heads (left) + scroll area (right) */
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

  /* Initial dynamic content */
  renderRulerInto(ruler, seq.durationSec);
  renderTrackHeads(trackHeadsContainer, state);
  renderTracks(tracksContainer, state);

  return {
    root,
    zoomInput,
    zoomVal,
    snapBtn,
    keyframeBtn,
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
   TOOLBAR BUILDER
   ============================================================ */

interface ToolbarRefs {
  readonly toolbar: HTMLElement;
  readonly zoomInput: HTMLInputElement;
  readonly zoomVal: HTMLElement;
  readonly snapBtn: HTMLButtonElement;
  readonly keyframeBtn: HTMLButtonElement;
}

function buildToolbar(state: AppState): ToolbarRefs {
  const toolbar = el("div", { className: "tl-toolbar" });

  /* --- Left group: tools | undo/redo | keyframe --- */
  const toolsLeft = el("div", { className: "tl-tools" });

  for (const t of TOOL_DEFS) {
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

  const keyframeBtn = el("button", {
    className: "icon-btn kf-none",
    attrs: { title: "Toggle keyframe at playhead" },
  });
  keyframeBtn.append(createIcon("diamond"));
  keyframeBtn.disabled = true;

  toolsLeft.append(
    undoBtn,
    redoBtn,
    el("span", { className: "divider" }),
    keyframeBtn,
  );

  /* --- Right group: snap | zoom --- */
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
    `${((state.ui.timeline.zoom - ZOOM_PERCENT_MIN) / ZOOM_PERCENT_RANGE) * 100}%`,
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

  return { toolbar, zoomInput, zoomVal, snapBtn, keyframeBtn };
}

/* ============================================================
   RULER
   ============================================================ */

export function renderRulerInto(ruler: HTMLElement, durationSec: number): void {
  clear(ruler);
  for (const lbl of computeRulerLabels(durationSec)) {
    const labelEl = el("span", { className: "rl", text: lbl.label });
    labelEl.style.left = `${lbl.percent * 100}%`;
    ruler.append(labelEl);
  }
}

/* ============================================================
   TRACK HEADS
   ============================================================ */

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
    btns.append(buildTrackToggleButton(track));
    btns.append(buildLockButton(track));
    th.append(btns);

    container.append(th);
  }
}

/** First button: mute toggle (audio) or hide toggle (video). */
function buildTrackToggleButton(track: Track): HTMLButtonElement {
  const isAudio = track.kind === "audio";
  const isActive = isAudio ? track.muted : track.hidden;

  let icon: IconName;
  let title: string;
  if (isAudio) {
    icon = isActive ? "volume-muted" : "volume";
    title = isActive ? "Unmute track" : "Mute track";
  } else {
    icon = "eye";
    title = isActive ? "Show track" : "Hide track";
  }

  const btn = el("button", {
    className: `icon-btn${isActive ? " active" : ""}`,
    attrs: { title },
  });
  btn.append(createIcon(icon));
  btn.dataset["toggle"] = isAudio ? "muted" : "hidden";
  return btn;
}

function buildLockButton(track: Track): HTMLButtonElement {
  const btn = el("button", {
    className: `icon-btn${track.locked ? " active" : ""}`,
    attrs: { title: track.locked ? "Unlock track" : "Lock track" },
  });
  btn.append(createIcon("lock"));
  btn.dataset["toggle"] = "locked";
  return btn;
}

/* ============================================================
   TRACKS
   ============================================================ */

export function renderTracks(container: HTMLElement, state: AppState): void {
  clear(container);

  const selectedTransitionId = state.selection.selectedTransitionId;
  const dur = state.project.sequence.durationSec;
  const selectedClipIds = new Set(state.selection.selectedClipIds);

  for (const track of state.project.sequence.tracks) {
    const trackEl = el("div", {
      className: `track${track.kind === "video" ? " video" : ""}`,
    });
    trackEl.dataset["trackId"] = track.id;

    for (const clip of getClipsInTrack(track)) {
      trackEl.append(renderClip(clip, state, selectedClipIds.has(clip.id)));
    }

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

  const clipEl = el("div", {
    className: `clip ${clip.kind} c-${clip.colorToken}${isSelected ? " selected" : ""}`,
  });
  clipEl.style.left = `${leftPct}%`;
  clipEl.style.width = `${widthPct}%`;
  clipEl.dataset["clipId"] = clip.id;

  /* Label */
  const label = el("div", { className: "clip-label" });
  const iconName =
    clip.kind === "text"
      ? "text"
      : clip.kind === "audio"
        ? "music"
        : clip.kind === "shape"
          ? "shapes"
          : "film";
  label.append(
    createIcon(iconName),
    el("span", { className: "clip-label-text", text: clip.name }),
  );
  clipEl.append(label);

  /* Waveform (audio only) */
  if (clip.kind === "audio") {
    const wave = el("div", { className: "wave" });
    for (const h of generateWaveform(clip.id)) {
      const bar = el("i");
      bar.style.height = `${h}%`;
      wave.append(bar);
    }
    clipEl.append(wave);
  }

  /* Keyframe markers */
  appendKeyframeMarkers(clipEl, clip);

  /* Trim handle (right edge) */
  if (canTrimClip(clip)) {
    clipEl.append(el("div", { className: "clip-trim clip-trim-right" }));
  }

  return clipEl;
}

function appendKeyframeMarkers(clipEl: HTMLElement, clip: Clip): void {
  const kfMap = clip.keyframes ?? {};
  const kfTimes = new Set<number>();

  for (const key of KEYFRAMEABLE_KEYS) {
    for (const kf of kfMap[key] ?? []) {
      /* Dedup by 2 decimals — 2.001 and 2.004 → same marker. */
      kfTimes.add(Math.round(kf.timeSec * 100) / 100);
    }
  }

  if (kfTimes.size === 0 || clip.durationSec <= 0) return;

  const layer = el("div", { className: "clip-keyframe-layer" });
  const sorted = Array.from(kfTimes).sort((a, b) => a - b);

  for (const t of sorted) {
    const pct = (t / clip.durationSec) * 100;
    const marker = el("div", { className: "clip-keyframe-marker" });
    /* Clamp so marker stays fully inside clip (overflow:hidden). */
    marker.style.left = `clamp(5px, ${pct}%, calc(100% - 5px))`;
    marker.title = `Keyframe @ ${t.toFixed(2)}s`;
    marker.dataset["kfTime"] = String(t);
    layer.append(marker);
  }

  clipEl.append(layer);
}

/* ============================================================
   TRANSITION BOX
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
  box.setAttribute(
    "title",
    hasTransition
      ? `${junction.existingTransition!.kind} · ${junction.existingTransition!.durationSec}s — right-click for options`
      : "Click to add · right-click to choose kind",
  );

  const icon = createIcon("blend");
  icon.style.width = "12px";
  icon.style.height = "12px";
  box.append(icon);

  return box;
}

/* ============================================================
   UPDATERS (called by subscriber)
   ============================================================ */

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
  const zoom = state.ui.timeline.zoom;
  view.tlContent.style.setProperty("--zoom", String(zoom));

  if (view.zoomInput.value !== String(zoom)) {
    view.zoomInput.value = String(zoom);
  }
  view.zoomInput.style.setProperty(
    "--val",
    `${((zoom - ZOOM_PERCENT_MIN) / ZOOM_PERCENT_RANGE) * 100}%`,
  );
  view.zoomVal.textContent = `${Math.round(zoom * 100)}%`;
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
  view.tlScroll.classList.toggle("hand-mode", tool === "hand");
  view.tlScroll.classList.toggle("text-mode", tool === "text");
}
