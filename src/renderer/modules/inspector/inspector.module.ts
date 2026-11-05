import { setChildren } from "@core/Dom";
import { appStore } from "@state/appStore";
import type { AppState } from "@shared/types/state";
import type { Clip } from "@shared/types/timeline";
import {
  DEFAULT_CLIP_TRANSFORM,
  DEFAULT_CLIP_COLOR,
  DEFAULT_CLIP_AUDIO,
} from "@shared/types/timeline";

import { getActiveClip } from "@state/selectors";
import {
  renderInspector,
  updatePaneContents,
  updateClipInactive,
  type InspectorView,
} from "./inspector.view";
import { attachInspectorController } from "./inspector.controller";
import { sliderPercent } from "./inspector.logic";

export function mountInspector(container: HTMLElement): () => void {
  const initial = appStore.getState();
  const initialClip = getActiveClip(initial);
  const view = renderInspector(initial, initialClip);
  setChildren(container, view.root);

  const unsubscribe = appStore.subscribe((state, prev) => {
    const activeClip = getActiveClip(state);
    const prevActiveClip = getActiveClip(prev);

    /* Selection atau clip identity berubah → re-render panes */
    if (activeClip?.id !== prevActiveClip?.id) {
      updatePaneContents(view, state, activeClip);
      updateClipInactive(view, activeClip);
      syncActiveTab(view, state);
      syncCollapsed(view, state);
      return;
    }

    /* Transform atau color berubah (dari action eksternal / undo) → sync UI */
    if (
      activeClip &&
      (activeClip.transform !== prevActiveClip?.transform ||
        activeClip.color !== prevActiveClip?.color ||
        activeClip.audio !== prevActiveClip?.audio)
    ) {
      syncClipPropertiesFromClip(view, activeClip);
    }

    /* Tab switch */
    if (state.ui.inspector.activeTab !== prev.ui.inspector.activeTab) {
      syncActiveTab(view, state);
    }

    /* Collapse toggle */
    if (
      state.ui.inspector.collapsedGroups !== prev.ui.inspector.collapsedGroups
    ) {
      syncCollapsed(view, state);
    }
  });

  const detach = attachInspectorController(view);

  return () => {
    detach();
    unsubscribe();
    container.replaceChildren();
  };
}

function syncActiveTab(view: InspectorView, state: AppState): void {
  const activeTab = state.ui.inspector.activeTab;
  for (const [id, btn] of view.tabButtons) {
    btn.classList.toggle("active", id === activeTab);
  }
  for (const [id, pane] of view.panes) {
    pane.hidden = id !== activeTab;
  }
}

function syncCollapsed(view: InspectorView, state: AppState): void {
  const collapsed = new Set(state.ui.inspector.collapsedGroups);
  for (const [groupId, groupEl] of view.groupEls) {
    groupEl.classList.toggle("collapsed", collapsed.has(groupId));
  }
}

function syncClipPropertiesFromClip(view: InspectorView, clip: Clip): void {
  const transform = clip.transform ?? DEFAULT_CLIP_TRANSFORM;
  const color = clip.color ?? DEFAULT_CLIP_COLOR;
  const audio = clip.audio ?? DEFAULT_CLIP_AUDIO;

  for (const [input, ref] of view.sliders) {
    let value: number | null = null;

    if (ref.def.transformKey) {
      value = Number(transform[ref.def.transformKey]);
    } else if (ref.def.colorKey) {
      value = Number(color[ref.def.colorKey]);
    } else if (ref.def.audioKey) {
      value = Number(audio[ref.def.audioKey]);
    }

    if (value === null) continue;

    const strValue = String(value);
    if (input.value !== strValue) {
      input.value = strValue;
      const min = Number(input.min);
      const max = Number(input.max);
      input.style.setProperty("--val", `${sliderPercent(value, min, max)}%`);
      ref.valueEl.textContent = ref.def.format(value);
    }
  }

  for (const [button, ref] of view.switches) {
    if (!ref.def.transformKey) continue;
    const on = Boolean(transform[ref.def.transformKey]);
    if (button.classList.contains("on") !== on) {
      button.classList.toggle("on", on);
      button.setAttribute("aria-pressed", String(on));
    }
  }
}
