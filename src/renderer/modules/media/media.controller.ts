import { on, delegate } from "@core/Dom";
import * as actions from "@state/actions";
import { appStore } from "@state/appStore";
import type { MediaView } from "./media.view";

export interface MediaControllerCallbacks {
  readonly onImportClick: () => void;
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

  return () => cleanups.forEach((fn) => fn());
}
