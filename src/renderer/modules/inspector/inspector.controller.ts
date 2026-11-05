import { on, delegate } from "@core/Dom";
import * as actions from "@state/actions";
import { sliderPercent } from "./inspector.logic";
import type { InspectorView } from "./inspector.view";
import type { InspectorPanelTab } from "@shared/types/state";

/* ============================================================
   INSPECTOR CONTROLLER
   ------------------------------------------------------------
   Semua interaksi via event delegation di root — tidak perlu
   attach per-control, karena row dinamis (kelak bisa berubah
   dari clip properties).

   F10 scope:
   - Tab switching → actions.setInspectorTab
   - Group toggle → actions.toggleInspectorGroup
   - Slider input → update --val + .val text (LOCAL, tidak store)
   - Switch toggle → toggle .on class (LOCAL, tidak store)

   F11+: saat clip di-select, tambah handler yang menulis ke
   clip properties via action baru.
   ============================================================ */

export function attachInspectorController(view: InspectorView): () => void {
  const cleanups: Array<() => void> = [];

  /* Tab buttons */
  cleanups.push(
    delegate(view.root, "click", ".tab[data-tab]", (_ev, tab) => {
      const tabId = (tab as HTMLElement).dataset["tab"] as
        | InspectorPanelTab
        | undefined;
      if (tabId) actions.setInspectorTab(tabId);
    }),
  );

  /* Group head toggle */
  cleanups.push(
    delegate(view.root, "click", ".group-head", (_ev, head) => {
      const groupEl = (head as HTMLElement).closest(
        ".group",
      ) as HTMLElement | null;
      const groupId = groupEl?.dataset["group"];
      if (groupId) actions.toggleInspectorGroup(groupId);
    }),
  );

  /* Slider input — local update only */
  cleanups.push(
    on(view.root, "input", (ev) => {
      const target = ev.target;
      if (!(target instanceof HTMLInputElement) || target.type !== "range")
        return;

      const ref = view.sliders.get(target);
      if (!ref) return;

      const value = Number(target.value);
      const min = Number(target.min);
      const max = Number(target.max);
      target.style.setProperty("--val", `${sliderPercent(value, min, max)}%`);
      ref.valueEl.textContent = ref.def.format(value);
    }),
  );

  /* Switch toggle — local update only */
  cleanups.push(
    delegate(view.root, "click", ".switch", (ev, sw) => {
      ev.stopPropagation();
      const el = sw as HTMLButtonElement;
      const isOn = el.classList.toggle("on");
      el.setAttribute("aria-pressed", String(isOn));
    }),
  );

  return () => cleanups.forEach((fn) => fn());
}
