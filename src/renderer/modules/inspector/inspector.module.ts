import { setChildren } from "@core/Dom";
import { appStore } from "@state/appStore";
import type { AppState } from "@shared/types/state";
import { renderInspector, type InspectorView } from "./inspector.view";
import { attachInspectorController } from "./inspector.controller";

/* ============================================================
   INSPECTOR MODULE — ENTRY
   ============================================================ */

export function mountInspector(container: HTMLElement): () => void {
  const initial = appStore.getState();
  const view = renderInspector(initial);
  setChildren(container, view.root);

  /* Subscriber — hanya handle tab + collapse (state store).
     Slider/switch = local DOM state, tidak ada re-render dari luar. */
  const unsubscribe = appStore.subscribe((state, prev) => {
    if (state.ui.inspector.activeTab !== prev.ui.inspector.activeTab) {
      syncActiveTab(view, state);
    }
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
