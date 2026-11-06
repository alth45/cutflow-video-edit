import { on, delegate } from "@core/Dom";
import * as actions from "@state/actions";
import { appStore } from "@state/appStore";
import { getClipById } from "@state/selectors";
import { sliderPercent } from "./inspector.logic";
import type { InspectorView } from "./inspector.view";
import type { InspectorPanelTab } from "@shared/types/state";
import {
  DEFAULT_CLIP_TRANSFORM,
  DEFAULT_CLIP_COLOR,
  DEFAULT_CLIP_AUDIO,
} from "@shared/types/timeline";
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

  /* Slider input — local update + bind to action */
  cleanups.push(
    on(view.root, "input", (ev) => {
      const target = ev.target;
      if (!(target instanceof HTMLInputElement) || target.type !== "range")
        return;
      if (target.disabled) return;

      const ref = view.sliders.get(target);
      if (!ref) return;

      const value = Number(target.value);
      const min = Number(target.min);
      const max = Number(target.max);
      target.style.setProperty("--val", `${sliderPercent(value, min, max)}%`);
      ref.valueEl.textContent = ref.def.format(value);

      /* Bind ke clip transform atau color. */
      const state = appStore.getState();
      const activeId = state.selection.selectedClipIds[0];
      if (!activeId) return;
      const clip = getClipById(state, activeId);
      if (!clip) return;

      if (ref.def.transformKey) {
        actions.setClipTransformProperty(activeId, ref.def.transformKey, value);
      } else if (ref.def.colorKey) {
        actions.setClipColorProperty(activeId, ref.def.colorKey, value);
      } else if (ref.def.audioKey) {
        actions.setClipAudioProperty(activeId, ref.def.audioKey, value);
      }
    }),
  );

  /* Switch click — local toggle + bind to action */
  cleanups.push(
    delegate(view.root, "click", ".switch", (ev, sw) => {
      ev.stopPropagation();
      const button = sw as HTMLButtonElement;
      if (button.disabled) return;

      const ref = view.switches.get(button);
      if (!ref) return;

      if (ref.def.transformKey) {
        const state = appStore.getState();
        const activeId = state.selection.selectedClipIds[0];
        if (!activeId) return;
        const clip = getClipById(state, activeId);
        if (!clip) return;
        const current = (clip.transform ?? DEFAULT_CLIP_TRANSFORM)[
          ref.def.transformKey
        ];
        actions.setClipTransformProperty(
          activeId,
          ref.def.transformKey,
          !current,
        );
        return;
      }

      if (ref.def.audioKey) {
        const state = appStore.getState();
        const activeId = state.selection.selectedClipIds[0];
        if (!activeId) return;
        const clip = getClipById(state, activeId);
        if (!clip) return;
        const current = (clip.audio ?? DEFAULT_CLIP_AUDIO)[ref.def.audioKey];
        actions.setClipAudioProperty(activeId, ref.def.audioKey, !current);
        return;
      }

      /* Unbound (placeholder): local toggle only */
      const isOn = button.classList.toggle("on");
      button.setAttribute("aria-pressed", String(isOn));
    }),
  );

  return () => cleanups.forEach((fn) => fn());
}
