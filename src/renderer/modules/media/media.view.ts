import { el, clear } from "@core/Dom";
import { createIcon } from "@core/icons";
import {
  EFFECTS,
  TRANSITIONS,
  filterMediaAssets,
  filterListEntries, // ← baru
  getImageAssets, // ← baru
  getVideoAssets, // ← baru
  getGradientClass,
  hashIndex,
  formatDurationBadge,
  type ListEntry,
} from "./media.logic";
import type { MediaAsset } from "@shared/types/project";
import type { AppState, MediaPanelTab } from "@shared/types/state";
import { mediaUrl, isDemoPath } from "@utils/media-url";

/* ============================================================
   MEDIA VIEW
   ------------------------------------------------------------
   `renderMediaView(state)` = build struktur statis.
   Konten dinamis (bin, fx, tr) diisi via fungsi `render*` yang
   dipanggil terpisah oleh module. Ini penting: subscriber bisa
   update bin saja tanpa sentuh struktur/input focus.
   ============================================================ */

export interface MediaView {
  readonly root: HTMLElement;
  readonly tabButtons: ReadonlyMap<MediaPanelTab, HTMLButtonElement>;
  readonly panes: ReadonlyMap<MediaPanelTab, HTMLElement>;
  readonly searchInput: HTMLInputElement;
  readonly importButton: HTMLButtonElement;
  readonly binContainer: HTMLElement;
  readonly fxContainer: HTMLElement;
  readonly trContainer: HTMLElement;
}

const TAB_DEFS: ReadonlyArray<{ id: MediaPanelTab; label: string }> = [
  { id: "media-bin", label: "Media" },
  { id: "media-fx", label: "Effects" },
  { id: "media-tr", label: "Transitions" },
];

export function renderMediaView(state: AppState): MediaView {
  const root = el("div", { className: "media-inner" });
  root.style.cssText =
    "display:flex;flex-direction:column;height:100%;min-height:0;";

  /* ---- Panel head — tabs ---- */
  const head = el("div", { className: "panel-head" });
  const tabs = el("div", { className: "tabs" });
  const tabButtons = new Map<MediaPanelTab, HTMLButtonElement>();

  for (const def of TAB_DEFS) {
    const isActive = state.ui.media.activeTab === def.id;
    const btn = el("button", {
      className: `tab${isActive ? " active" : ""}`,
      text: def.label,
    });
    btn.dataset["tab"] = def.id;
    tabs.append(btn);
    tabButtons.set(def.id, btn);
  }
  head.append(tabs);

  /* ---- Search ---- */
  const search = el("div", { className: "search" });
  const searchIcon = createIcon("search", "ic");
  searchIcon.style.cssText = "width:14px;height:14px";

  const searchInput = el("input", {
    attrs: { type: "text", placeholder: "Search assets…" },
  });
  searchInput.value = state.ui.media.searchQuery;

  const importButton = el("button", {
    className: "icon-btn",
    attrs: { title: "Import" },
  });
  importButton.style.cssText = "width:22px;height:22px";
  const plusIcon = createIcon("plus", "ic");
  plusIcon.style.cssText = "width:13px;height:13px";
  importButton.append(plusIcon);

  search.append(searchIcon, searchInput, importButton);

  /* ---- Panel body — 3 panes ---- */
  const body = el("div", { className: "panel-body" });
  const panes = new Map<MediaPanelTab, HTMLElement>();

  const binPane = el("div");
  binPane.dataset["pane"] = "media-bin";
  const binContainer = el("div");
  binPane.append(binContainer);
  panes.set("media-bin", binPane);
  body.append(binPane);

  const fxPane = el("div");
  fxPane.dataset["pane"] = "media-fx";
  const fxContainer = el("div");
  fxPane.append(fxContainer);
  panes.set("media-fx", fxPane);
  body.append(fxPane);

  const trPane = el("div");
  trPane.dataset["pane"] = "media-tr";
  const trContainer = el("div");
  trPane.append(trContainer);
  panes.set("media-tr", trPane);
  body.append(trPane);

  panes.forEach((pane, id) => {
    pane.hidden = id !== state.ui.media.activeTab;
  });

  root.append(head, search, body);

  return {
    root,
    tabButtons,
    panes,
    searchInput,
    importButton,
    binContainer,
    fxContainer,
    trContainer,
  };
}

/* ============================================================
   RENDER: MEDIA BIN
   ============================================================ */

export function renderMediaBin(
  container: HTMLElement,
  assets: readonly MediaAsset[],
  query: string,
): void {
  clear(container);
  const filtered = filterMediaAssets(assets, query);

  if (filtered.length === 0) {
    container.append(
      el("div", {
        className: "bin-empty",
        text: query.trim() ? "No assets match search" : "No media imported yet",
      }),
    );
    return;
  }

  const videoAssets = filtered.filter((a) => a.kind !== "audio");
  const audioAssets = filtered.filter((a) => a.kind === "audio");

  if (videoAssets.length > 0) {
    container.append(
      renderBinLabel("Footage", videoAssets.length),
      renderThumbsGrid(videoAssets),
    );
  }
  if (audioAssets.length > 0) {
    container.append(
      renderBinLabel("Audio", audioAssets.length),
      renderThumbsGrid(audioAssets),
    );
  }
}

export function renderBinLabel(label: string, count: number): HTMLElement {
  const wrap = el("div", { className: "bin-label" });
  wrap.append(
    document.createTextNode(label),
    el("span", { text: String(count) }),
  );
  return wrap;
}

export function renderThumbsGrid(assets: readonly MediaAsset[]): HTMLElement {
  const grid = el("div", { className: "thumbs" });
  for (const asset of assets) grid.append(renderThumb(asset));
  return grid;
}

function renderThumb(asset: MediaAsset): HTMLElement {
  const thumb = el("div", {
    className: "thumb",
    attrs: { draggable: "true" },
  });
  thumb.dataset["assetId"] = asset.id;
  thumb.title = asset.name;

  const img = el("div", { className: "thumb-img" });

  /* ---------- Decide visual content ---------- */
  if (isDemoPath(asset.path)) {
    /* Demo assets — file tidak ada, gradient only */
    img.classList.add(getGradientClass(hashIndex(asset.name)));
  } else if (asset.kind === "image") {
    /* Blur fill — di-set setelah img load (reuse cache URL, no extra fetch). */
    const blur = el("div", { className: "thumb-blur" });

    const imgEl = el("img", {
      attrs: { alt: "", decoding: "async" },
    });
    imgEl.src = mediaUrl(asset.path);

    imgEl.addEventListener("load", () => {
      /* Blur pakai URL yang sama → Chromium pakai cached image. */
      blur.style.backgroundImage = `url("${imgEl.src}")`;
    });

    imgEl.addEventListener("error", () => {
      imgEl.remove();
      blur.remove();
      img.classList.add(getGradientClass(hashIndex(asset.name)));
    });

    img.append(blur, imgEl);
  } else if (asset.kind === "video") {
    /* Video — blur dari captured frame setelah video loaded. */
    const videoEl = el("video", {
      attrs: { preload: "metadata", playsinline: "" },
    });
    videoEl.muted = true;
    videoEl.src = mediaUrl(asset.path) + "#t=0.1";

    videoEl.addEventListener("loadeddata", () => {
      /* Capture frame ke canvas kecil, encode JPEG, set sebagai blur bg.
         Ukuran 32×32 cukup karena blur akan menghilangkan detail. */
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(videoEl, 0, 0, 32, 32);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
          const blur = el("div", { className: "thumb-blur" });
          blur.style.backgroundImage = `url(${dataUrl})`;
          img.prepend(blur);
        }
      } catch {
        /* drawImage bisa throw jika video tidak decode — abaikan. */
      }
    });

    videoEl.addEventListener("error", () => {
      videoEl.remove();
      img.classList.add(getGradientClass(hashIndex(asset.name)));
    });

    img.append(videoEl);
  } else {
    /* Audio — no visual content, gradient + music icon */
    img.classList.add(getGradientClass(hashIndex(asset.name)));
    const iconWrap = el("div", { className: "thumb-audio-icon" });
    iconWrap.append(createIcon("music"));
    img.append(iconWrap);
  }

  const duration = formatDurationBadge(asset.durationSec);
  if (duration) img.append(el("span", { className: "dur", text: duration }));

  thumb.append(img, el("div", { className: "thumb-name", text: asset.name }));
  return thumb;
}

/* ============================================================
   RENDER: STATIC LISTS (effects, transitions)
   ============================================================ */

/* ============================================================
   RENDER: EFFECTS PANE (F14b+)
   ------------------------------------------------------------
   Struktur:
     [Video Effects]         ← built-in, filtered by search
       Color Balance
       ...
     [Imported]              ← images, filtered by search
       [thumbnail] [thumbnail]
   ============================================================ */

export function renderEffectsPane(
  container: HTMLElement,
  assets: readonly MediaAsset[],
  query: string,
): void {
  clear(container);

  const filteredEffects = filterListEntries(EFFECTS, query);
  const images = getImageAssets(assets);
  const filteredImages = filterMediaAssets(images, query);

  const builtInMatches = filteredEffects.length > 0;
  const importedMatches = filteredImages.length > 0;

  if (!builtInMatches && !importedMatches) {
    container.append(
      el("div", { className: "bin-empty", text: "No items match search" }),
    );
    return;
  }

  if (builtInMatches) {
    container.append(renderBinLabel("Video Effects", filteredEffects.length));
    for (const fx of filteredEffects) container.append(renderListItem(fx));
  }

  if (importedMatches) {
    container.append(renderBinLabel("Imported", filteredImages.length));
    container.append(renderThumbsGrid(filteredImages));
  }
}

/* ============================================================
   RENDER: TRANSITIONS PANE (F14b+)
   ============================================================ */

export function renderTransitionsPane(
  container: HTMLElement,
  assets: readonly MediaAsset[],
  query: string,
): void {
  clear(container);

  const filteredTransitions = filterListEntries(TRANSITIONS, query);
  const videos = getVideoAssets(assets);
  const filteredVideos = filterMediaAssets(videos, query);

  const builtInMatches = filteredTransitions.length > 0;
  const importedMatches = filteredVideos.length > 0;

  if (!builtInMatches && !importedMatches) {
    container.append(
      el("div", { className: "bin-empty", text: "No items match search" }),
    );
    return;
  }

  if (builtInMatches) {
    container.append(renderBinLabel("Transitions", filteredTransitions.length));
    for (const tr of filteredTransitions) container.append(renderListItem(tr));
  }

  if (importedMatches) {
    container.append(renderBinLabel("Imported", filteredVideos.length));
    container.append(renderThumbsGrid(filteredVideos));
  }
}

function renderListItem(entry: ListEntry): HTMLElement {
  const item = el("div", {
    className: "list-item",
    attrs: { draggable: "true" },
  });
  item.dataset["itemName"] = entry.name;

  const swatch = el("div", {
    className: `swatch ${getGradientClass(entry.gradientIndex - 1)}`,
  });

  const textWrap = el("div");
  textWrap.append(
    el("div", { className: "li-name", text: entry.name }),
    el("div", { className: "li-sub", text: entry.sub }),
  );

  item.append(swatch, textWrap);
  return item;
}
