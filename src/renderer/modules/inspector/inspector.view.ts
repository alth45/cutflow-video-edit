import { el } from "@core/Dom";
import { createIcon } from "@core/icons";
import {
  INSPECTOR_TABS,
  sliderPercent,
  type GroupDef,
  type RowDef,
  type SliderRow,
  type SwitchRow,
  type TabDef,
} from "./inspector.logic";
import type { AppState, InspectorPanelTab } from "@shared/types/state";
import type {
  Clip,
  ClipTransform,
  ClipColor,
  ClipAudio,
  ClipChromaKey,
} from "@shared/types/timeline";
import {
  DEFAULT_CLIP_TRANSFORM,
  DEFAULT_CLIP_COLOR,
  DEFAULT_CLIP_AUDIO,
  DEFAULT_CHROMA_KEY,
} from "@shared/types/timeline";
import { type SegmentedRow } from "./inspector.logic";
export interface SliderRef {
  readonly input: HTMLInputElement;
  readonly valueEl: HTMLElement;
  readonly def: SliderRow;
  readonly keyframeBtn: HTMLButtonElement | null;
}

export interface SwitchRef {
  readonly button: HTMLButtonElement;
  readonly def: SwitchRow;
}

export interface InspectorView {
  readonly root: HTMLElement;
  readonly panelBody: HTMLElement;
  readonly tabButtons: ReadonlyMap<InspectorPanelTab, HTMLButtonElement>;
  readonly panes: ReadonlyMap<InspectorPanelTab, HTMLElement>;
  readonly groupEls: Map<string, HTMLElement>;
  readonly sliders: Map<HTMLInputElement, SliderRef>;
  readonly switches: Map<HTMLButtonElement, SwitchRef>;
}

export function renderInspector(
  initial: AppState,
  activeClip: Clip | undefined,
): InspectorView {
  const root = el("div");
  root.style.cssText =
    "display:flex;flex-direction:column;height:100%;min-height:0;";

  const head = el("div", { className: "panel-head" });
  const tabs = el("div", { className: "tabs" });
  const tabButtons = new Map<InspectorPanelTab, HTMLButtonElement>();

  for (const tabDef of INSPECTOR_TABS) {
    const isActive = initial.ui.inspector.activeTab === tabDef.id;
    const btn = el("button", {
      className: `tab${isActive ? " active" : ""}`,
      text: tabDef.label,
    });
    btn.dataset["tab"] = tabDef.id;
    tabs.append(btn);
    tabButtons.set(tabDef.id, btn);
  }
  head.append(tabs);

  const panelBody = el("div", { className: "panel-body" });
  const panes = new Map<InspectorPanelTab, HTMLElement>();

  for (const tabDef of INSPECTOR_TABS) {
    const pane = el("div");
    pane.dataset["pane"] = tabDef.id;
    pane.hidden = initial.ui.inspector.activeTab !== tabDef.id;
    panes.set(tabDef.id, pane);
    panelBody.append(pane);
  }

  root.append(head, panelBody);

  const view: InspectorView = {
    root,
    panelBody,
    tabButtons,
    panes,
    groupEls: new Map(),
    sliders: new Map(),
    switches: new Map(),
  };

  /* Populasi awal + set clip-inactive */
  updatePaneContents(view, initial, activeClip);
  updateClipInactive(view, activeClip);

  return view;
}

export function updatePaneContents(
  view: InspectorView,
  state: AppState,
  activeClip: Clip | undefined,
): void {
  view.groupEls.clear();
  view.sliders.clear();
  view.switches.clear();

  const collapsed = state.ui.inspector.collapsedGroups;

  for (const tabDef of INSPECTOR_TABS) {
    const pane = view.panes.get(tabDef.id);
    if (!pane) continue;
    pane.replaceChildren();
    for (const groupDef of tabDef.groups) {
      const groupEl = renderGroup(
        groupDef,
        collapsed.includes(groupDef.id),
        activeClip,
        view.sliders,
        view.switches,
      );
      view.groupEls.set(groupDef.id, groupEl);
      pane.append(groupEl);
    }
  }
}

export function updateClipInactive(
  view: InspectorView,
  activeClip: Clip | undefined,
): void {
  const kind = activeClip?.kind;

  /* Relevance per tab berdasarkan clip kind. */
  const videoActive = kind === "video" || kind === "text";
  const audioActive = kind === "audio" || kind === "video";
  const colorActive = kind === "video" || kind === "text";

  view.panes.get("insp-video")?.classList.toggle("clip-inactive", !videoActive);
  view.panes.get("insp-audio")?.classList.toggle("clip-inactive", !audioActive);
  view.panes.get("insp-color")?.classList.toggle("clip-inactive", !colorActive);
}

/* ============================================================
   GROUP RENDERER
   ============================================================ */

function renderGroup(
  def: GroupDef,
  collapsed: boolean,
  activeClip: Clip | undefined,
  slidersOut: Map<HTMLInputElement, SliderRef>,
  switchesOut: Map<HTMLButtonElement, SwitchRef>,
): HTMLElement {
  const group = el("div", {
    className: `group${collapsed ? " collapsed" : ""}`,
  });
  group.dataset["group"] = def.id;

  const head = el("div", { className: "group-head" });
  head.append(document.createTextNode(def.label));
  const chev = createIcon("chevron", "ic chev");
  chev.style.cssText = "width:14px;height:14px;";
  head.append(chev);

  const body = el("div", { className: "group-body" });
  for (const row of def.rows) {
    body.append(renderRow(row, activeClip, slidersOut, switchesOut));
  }

  group.append(head, body);
  return group;
}

/* ============================================================
   ROW RENDERER
   ============================================================ */

function renderRow(
  row: RowDef,
  activeClip: Clip | undefined,
  slidersOut: Map<HTMLInputElement, SliderRef>,
  switchesOut: Map<HTMLButtonElement, SwitchRef>,
): HTMLElement {
  switch (row.kind) {
    case "slider":
      return renderSliderRow(row, activeClip, slidersOut);
    case "switch":
      return renderSwitchRow(row, activeClip, switchesOut);
    case "segmented":
      return renderSegmentedRow(row, activeClip);
    case "curve":
      return renderCurveRow();
  }
}

function readTransformValue<K extends keyof ClipTransform>(
  activeClip: Clip | undefined,
  key: K,
  fallback: ClipTransform[K],
): ClipTransform[K] {
  if (!activeClip) return fallback;
  return (activeClip.transform ?? DEFAULT_CLIP_TRANSFORM)[key];
}

function readColorValue<K extends keyof ClipColor>(
  activeClip: Clip | undefined,
  key: K,
  fallback: ClipColor[K],
): ClipColor[K] {
  if (!activeClip) return fallback;
  return (activeClip.color ?? DEFAULT_CLIP_COLOR)[key];
}

function readAudioValue<K extends keyof ClipAudio>(
  activeClip: Clip | undefined,
  key: K,
  fallback: ClipAudio[K],
): ClipAudio[K] {
  if (!activeClip) return fallback;
  return (activeClip.audio ?? DEFAULT_CLIP_AUDIO)[key];
}

function readChromaValue<K extends keyof ClipChromaKey>(
  activeClip: Clip | undefined,
  key: K,
  fallback: ClipChromaKey[K],
): ClipChromaKey[K] {
  if (!activeClip) return fallback;
  return (activeClip.chromaKey ?? DEFAULT_CHROMA_KEY)[key];
}

function renderSliderRow(
  row: SliderRow,
  activeClip: Clip | undefined,
  slidersOut: Map<HTMLInputElement, SliderRef>,
): HTMLElement {
  const wrap = el("div", {
    className: `row${row.disabled ? " disabled" : ""}`,
  });

  const label = el("label", { text: row.label });

  let currentValue: number = row.defaultValue;
  if (row.transformKey) {
    currentValue = readTransformValue(
      activeClip,
      row.transformKey,
      row.defaultValue,
    ) as number;
  } else if (row.colorKey) {
    currentValue = readColorValue(
      activeClip,
      row.colorKey,
      row.defaultValue,
    ) as number;
  } else if (row.audioKey) {
    currentValue = readAudioValue(
      activeClip,
      row.audioKey,
      row.defaultValue,
    ) as number;
  } else if (row.chromaKey) {
    currentValue = readChromaValue(
      activeClip,
      row.chromaKey,
      row.defaultValue,
    ) as number;
  }

  const attrs: Record<string, string> = {
    type: "range",
    min: String(row.min),
    max: String(row.max),
    value: String(currentValue),
  };
  if (row.step !== undefined) attrs["step"] = String(row.step);

  const input = el("input", { attrs });
  input.style.setProperty(
    "--val",
    `${sliderPercent(currentValue, row.min, row.max)}%`,
  );
  if (row.disabled) input.disabled = true;

  const valueEl = el("span", {
    className: "val",
    text: row.format(currentValue),
  });

  let keyframeBtn: HTMLButtonElement | null = null;
  if (row.keyframeKey) {
    keyframeBtn = el("button", {
      className: "keyframe-btn",
      attrs: {
        type: "button",
        title: "Add/remove keyframe at playhead",
      },
    });
    keyframeBtn.dataset["keyframeKey"] = row.keyframeKey;
    keyframeBtn.append(document.createTextNode("◆"));
  }

  if (keyframeBtn) {
    wrap.append(keyframeBtn, label, input, valueEl);
  } else {
    wrap.append(label, input, valueEl);
  }

  slidersOut.set(input, { input, valueEl, def: row, keyframeBtn });
  return wrap;
}

function renderSwitchRow(
  row: SwitchRow,
  activeClip: Clip | undefined,
  switchesOut: Map<HTMLButtonElement, SwitchRef>,
): HTMLElement {
  const wrap = el("div", {
    className: `switch-row${row.disabled ? " disabled" : ""}`,
  });
  wrap.append(document.createTextNode(row.label));

  let on = row.defaultOn;
  if (row.transformKey) {
    on = Boolean(
      readTransformValue(activeClip, row.transformKey, row.defaultOn),
    );
  } else if (row.audioKey) {
    on = Boolean(readAudioValue(activeClip, row.audioKey, row.defaultOn));
  } else if (row.chromaKey) {
    on = Boolean(readChromaValue(activeClip, row.chromaKey, row.defaultOn));
  }

  const sw = el("button", {
    className: `switch${on ? " on" : ""}`,
    attrs: { type: "button", "aria-pressed": String(on) },
  });
  if (row.disabled) sw.disabled = true;

  wrap.append(sw);
  switchesOut.set(sw, { button: sw, def: row });
  return wrap;
}

function renderCurveRow(): HTMLElement {
  const box = el("div", { className: "curve-box" });
  box.innerHTML = `
    <svg viewBox="0 0 100 74" preserveAspectRatio="none">
      <line x1="0" y1="37" x2="100" y2="37" stroke="#1d2432" stroke-width="1"/>
      <line x1="50" y1="0" x2="50" y2="74" stroke="#1d2432" stroke-width="1"/>
      <path d="M0 74 C 28 66, 44 40, 62 24 S 88 6, 100 0"
            fill="none" stroke="#7c5cff" stroke-width="2" stroke-linecap="round"/>
      <circle cx="62" cy="24" r="3" fill="#fff" stroke="#7c5cff" stroke-width="2"/>
    </svg>
  `;
  return box;
}

export type KeyframeBtnState = "none" | "has" | "at";

export function setKeyframeBtnState(
  btn: HTMLButtonElement,
  state: KeyframeBtnState,
): void {
  btn.classList.remove("kf-none", "kf-has", "kf-at");
  btn.classList.add(`kf-${state}`);
}

function renderSegmentedRow(
  row: SegmentedRow,
  activeClip: Clip | undefined,
): HTMLElement {
  const wrap = el("div", { className: "row segmented-row" });
  wrap.append(el("label", { text: row.label }));

  const seg = el("div", { className: "segmented" });
  const current = String(
    readChromaValue(activeClip, row.chromaKey, row.defaultValue),
  );

  for (const opt of row.options) {
    const btn = el("button", {
      className: `segmented-btn${opt.value === current ? " active" : ""}`,
      text: opt.label,
    });
    btn.type = "button";
    btn.dataset["chromaKey"] = row.chromaKey;
    btn.dataset["value"] = opt.value;
    seg.append(btn);
  }

  wrap.append(seg, el("span", { className: "val" }));
  return wrap;
}
