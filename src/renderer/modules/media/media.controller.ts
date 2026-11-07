import { on, delegate } from "@core/Dom";
import * as actions from "@state/actions";
import { appStore } from "@state/appStore";
import type { MediaView } from "./media.view";
import { eventBus } from "@core/events";
import type { EffectKind, AnimationKind } from "@shared/types/timeline";
import { deleteMediaAssetsFlow } from "../../app/flows";

export interface MediaControllerCallbacks {
  readonly onImportClick: () => void;
}
function toast(
  message: string,
  tone: "info" | "success" | "warning" | "error" = "info",
): void {
  eventBus.emit("toast:show", { message, tone });
}

export function attachMediaController(
  view: MediaView,
  callbacks: MediaControllerCallbacks,
): () => void {
  const cleanups: Array<() => void> = [];

  /* Tab buttons */
  for (const [tabId, btn] of view.tabButtons) {
    cleanups.push(on(btn, "click", () => actions.setMediaTab(tabId)));
  }

  /* Search input */
  cleanups.push(
    on(view.searchInput, "input", (ev) => {
      actions.setSearchQuery((ev.target as HTMLInputElement).value);
    }),
  );

  /* ---- Click thumbnail → select / toggle ---- */
  cleanups.push(
    delegate(view.root, "click", ".thumb[data-asset-id]", (ev, thumb) => {
      ev.stopPropagation();
      const assetId = (thumb as HTMLElement).dataset["assetId"];
      if (!assetId) return;

      if (ev.ctrlKey || ev.metaKey) {
        actions.toggleMediaAssetSelection(assetId);
      } else {
        actions.selectMediaAsset(assetId);
      }
    }),
  );

  /* ---- Delete button in selection bar ---- */
  cleanups.push(
    on(view.deleteSelectionBtn, "click", (ev) => {
      ev.stopPropagation();
      const ids = appStore.getState().ui.media.selectedAssetIds;
      if (ids.length === 0) return;
      void deleteMediaAssetsFlow(ids);
    }),
  );

  /* ---- Click outside bin area → clear asset selection ---- */
  cleanups.push(
    on(document, "click", (ev) => {
      const target = ev.target as Node;
      if (view.root.contains(target)) return;
      const state = appStore.getState();
      if (state.ui.media.selectedAssetIds.length > 0) {
        actions.clearMediaAssetSelection();
      }
    }),
  );

  /* Import button */
  cleanups.push(on(view.importButton, "click", callbacks.onImportClick));

  /* Drag media — emit generic + specific MIME types.
     Specific type memberi info kind ke drop target TANPA
     butuh dataTransfer.getData (yang blocked selama dragover). */
  cleanups.push(
    delegate(view.root, "dragstart", ".thumb[data-asset-id]", (ev, thumb) => {
      const assetId = (thumb as HTMLElement).dataset["assetId"];
      if (!assetId) return;

      const asset = appStore
        .getState()
        .project.mediaAssets.find((a) => a.id === assetId);
      if (!asset) return;

      const specificType =
        asset.kind === "audio"
          ? "application/x-cutflow-media-audio"
          : "application/x-cutflow-media-video";

      ev.dataTransfer?.setData(specificType, assetId);
      ev.dataTransfer?.setData("application/x-cutflow-media", assetId);
      if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "copy";
    }),
  );

  /* Drag built-in item (effects/transitions) — unchanged */
  cleanups.push(
    delegate(
      view.root,
      "dragstart",
      ".list-item[data-item-name]",
      (ev, item) => {
        const name = (item as HTMLElement).dataset["itemName"];
        if (!name) return;
        ev.dataTransfer?.setData("application/x-cutflow-item", name);
        if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "copy";
      },
    ),
  );

  /* ---- Click effect → apply to selected clip ---- */
  cleanups.push(
    delegate(
      view.fxContainer,
      "click",
      ".list-item[data-effect-kind]",
      (ev, item) => {
        ev.stopPropagation();
        const kind = (item as HTMLElement).dataset["effectKind"] as
          | EffectKind
          | undefined;
        if (!kind) return;

        const state = appStore.getState();
        const selectedId = state.selection.selectedClipIds[0];
        if (!selectedId) {
          toast("Select a clip first", "warning");
          return;
        }
        actions.addEffectToClip(selectedId, kind);
      },
    ),
  );

  /* ---- Click animation → apply / toggle ---- */
  cleanups.push(
    delegate(
      view.animContainer,
      "click",
      ".list-item[data-animation-kind]",
      (ev, item) => {
        ev.stopPropagation();
        const kind = (item as HTMLElement).dataset["animationKind"] as
          | AnimationKind
          | undefined;
        if (!kind) return;

        const state = appStore.getState();
        const selectedId = state.selection.selectedClipIds[0];
        if (!selectedId) {
          toast("Select a clip first", "warning");
          return;
        }
        actions.toggleClipAnimation(selectedId, kind);
      },
    ),
  );

  return () => cleanups.forEach((fn) => fn());
}
