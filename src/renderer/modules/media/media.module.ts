import { setChildren } from "@core/Dom";
import { appStore } from "@state/appStore";
import type { AppState } from "@shared/types/state";
import {
  renderMediaView,
  renderMediaBin,
  renderEffectsPane,
  renderTransitionsPane,
  type MediaView,
} from "./media.view";
import { attachMediaController } from "./media.controller";
import { importMediaFlow } from "../../app/flows";

export function mountMedia(container: HTMLElement): () => void {
  const initial = appStore.getState();
  const view = renderMediaView(initial);
  setChildren(container, view.root);

  /* Initial content renders */
  renderAllPanes(view, initial);

  /* Subscriber: re-render panes ketika search query atau assets berubah */
  const unsubscribe = appStore.subscribe((state, prev) => {
    const tabChanged = state.ui.media.activeTab !== prev.ui.media.activeTab;
    const searchChanged =
      state.ui.media.searchQuery !== prev.ui.media.searchQuery;
    const assetsChanged =
      state.project.mediaAssets !== prev.project.mediaAssets;

    if (tabChanged) {
      syncActiveTab(view, state);
    }

    if (searchChanged) {
      if (view.searchInput.value !== state.ui.media.searchQuery) {
        view.searchInput.value = state.ui.media.searchQuery;
      }
    }

    if (searchChanged || assetsChanged) {
      renderAllPanes(view, state);
    }
  });

  const detach = attachMediaController(view, {
    onImportClick: () => {
      void importMediaFlow();
    },
  });

  return () => {
    detach();
    unsubscribe();
    container.replaceChildren();
  };
}

function syncActiveTab(view: MediaView, state: AppState): void {
  for (const [id, btn] of view.tabButtons) {
    btn.classList.toggle("active", id === state.ui.media.activeTab);
  }
  for (const [id, pane] of view.panes) {
    pane.hidden = id !== state.ui.media.activeTab;
  }
}

function renderAllPanes(view: MediaView, state: AppState): void {
  const assets = state.project.mediaAssets;
  const query = state.ui.media.searchQuery;
  renderMediaBin(view.binContainer, assets, query);
  renderEffectsPane(view.fxContainer, assets, query);
  renderTransitionsPane(view.trContainer, assets, query);
}
