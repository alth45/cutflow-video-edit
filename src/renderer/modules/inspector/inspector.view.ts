import { el } from "@core/Dom";
import { createIcon } from "@core/icons";
import {
  INSPECTOR_TABS,
  sliderPercent,
  type GroupDef,
  type RowDef,
  type SliderRow,
} from "./inspector.logic";
import type { AppState, InspectorPanelTab } from "@shared/types/state";

/* ============================================================
   INSPECTOR VIEW
   ============================================================ */

export interface SliderRef {
  readonly input: HTMLInputElement;
  readonly valueEl: HTMLElement;
  readonly def: SliderRow;
}

export interface InspectorView {
  readonly root: HTMLElement;
  readonly tabButtons: ReadonlyMap<InspectorPanelTab, HTMLButtonElement>;
  readonly panes: ReadonlyMap<InspectorPanelTab, HTMLElement>;
  readonly groupEls: ReadonlyMap<string, HTMLElement>;
  readonly sliders: ReadonlyMap<HTMLInputElement, SliderRef>;
}

export function renderInspector(state: AppState): InspectorView {
  const root = el("div");
  root.style.cssText =
    "display:flex;flex-direction:column;height:100%;min-height:0;";

  /* ---------- Head: tabs ---------- */
  const head = el("div", { className: "panel-head" });
  const tabs = el("div", { className: "tabs" });
  const tabButtons = new Map<InspectorPanelTab, HTMLButtonElement>();

  for (const tabDef of INSPECTOR_TABS) {
    const isActive = state.ui.inspector.activeTab === tabDef.id;
    const btn = el("button", {
      className: `tab${isActive ? " active" : ""}`,
      text: tabDef.label,
    });
    btn.dataset["tab"] = tabDef.id;
    tabs.append(btn);
    tabButtons.set(tabDef.id, btn);
  }
  head.append(tabs);

  /* ---------- Body: panes ---------- */
  const body = el("div", { className: "panel-body" });
  const panes = new Map<InspectorPanelTab, HTMLElement>();
  const groupEls = new Map<string, HTMLElement>();
  const sliders = new Map<HTMLInputElement, SliderRef>();

  for (const tabDef of INSPECTOR_TABS) {
    const pane = el("div");
    pane.dataset["pane"] = tabDef.id;
    pane.hidden = state.ui.inspector.activeTab !== tabDef.id;

    for (const groupDef of tabDef.groups) {
      const groupEl = renderGroup(
        groupDef,
        state.ui.inspector.collapsedGroups.includes(groupDef.id),
        sliders,
      );
      groupEls.set(groupDef.id, groupEl);
      pane.append(groupEl);
    }

    panes.set(tabDef.id, pane);
    body.append(pane);
  }

  root.append(head, body);

  return { root, tabButtons, panes, groupEls, sliders };
}

/* ============================================================
   GROUP RENDERER
   ============================================================ */

function renderGroup(
  def: GroupDef,
  collapsed: boolean,
  slidersOut: Map<HTMLInputElement, SliderRef>,
): HTMLElement {
  const group = el("div", {
    className: `group${collapsed ? " collapsed" : ""}`,
  });
  group.dataset["group"] = def.id;

  /* Head */
  const head = el("div", { className: "group-head" });
  head.append(document.createTextNode(def.label));

  const chev = createIcon("chevron", "ic chev");
  chev.style.cssText = "width:14px;height:14px;";
  head.append(chev);

  /* Body */
  const body = el("div", { className: "group-body" });

  for (const row of def.rows) {
    body.append(renderRow(row, slidersOut));
  }

  group.append(head, body);
  return group;
}

/* ============================================================
   ROW RENDERER
   ============================================================ */

function renderRow(
  row: RowDef,
  slidersOut: Map<HTMLInputElement, SliderRef>,
): HTMLElement {
  switch (row.kind) {
    case "slider":
      return renderSliderRow(row, slidersOut);
    case "switch":
      return renderSwitchRow(row.label, row.on);
    case "curve":
      return renderCurveRow();
  }
}

function renderSliderRow(
  row: SliderRow,
  slidersOut: Map<HTMLInputElement, SliderRef>,
): HTMLElement {
  const wrap = el("div", { className: "row" });

  const label = el("label", { text: row.label });

  const input = el("input", {
    attrs: {
      type: "range",
      min: String(row.min),
      max: String(row.max),
      value: String(row.value),
    },
  });
  input.style.setProperty(
    "--val",
    `${sliderPercent(row.value, row.min, row.max)}%`,
  );

  const valueEl = el("span", {
    className: "val",
    text: row.format(row.value),
  });

  wrap.append(label, input, valueEl);

  slidersOut.set(input, { input, valueEl, def: row });
  return wrap;
}

function renderSwitchRow(label: string, on: boolean): HTMLElement {
  const wrap = el("div", { className: "switch-row" });
  wrap.append(document.createTextNode(label));

  const sw = el("button", {
    className: `switch${on ? " on" : ""}`,
    attrs: { type: "button", "aria-pressed": String(on) },
  });
  wrap.append(sw);

  return wrap;
}

function renderCurveRow(): HTMLElement {
  const box = el("div", { className: "curve-box" });

  /* Static SVG dari original — innerHTML karena content SVG
     bukan sesuatu yang mudah di-generate via el(). Content
     hardcoded, tidak ada user data. */
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
