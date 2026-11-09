import { el, clear } from "@core/Dom";
import { createIcon } from "@core/icons";
import {
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
import { EFFECT_DEFINITIONS } from "@modules/effects/effect-definitions";
import type { Clip } from "@shared/types/timeline";
import {
  ANIMATION_DEFINITIONS,
  type AnimationDef,
} from "@modules/animations/animation-definitions";
import { SHAPE_DEFINITIONS } from "@modules/shapes/shape-definitions";

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
  readonly selectionBar: HTMLElement;
  readonly selectionCount: HTMLElement;
  readonly deleteSelectionBtn: HTMLButtonElement;
  readonly tabDropdown: HTMLElement; // wrapper
  readonly tabDropdownTrigger: HTMLButtonElement; // click target
  readonly tabDropdownMenu: HTMLElement; // popup menu
  readonly tabDropdownLabel: HTMLElement; // label (Animation/Shape/Insert)
  readonly animTabButton: HTMLButtonElement; // dropdown item
  readonly shapeTabButton: HTMLButtonElement; // dropdown item
  readonly shapeContainer: HTMLElement; // pane container
  readonly binContainer: HTMLElement;
  readonly fxContainer: HTMLElement;
  readonly trContainer: HTMLElement;
  readonly animContainer: HTMLElement;
}

const TAB_DEFS: ReadonlyArray<{ id: MediaPanelTab; label: string }> = [
  { id: "media-bin", label: "Media" },
  { id: "media-fx", label: "Effects" },
  { id: "media-tr", label: "Transitions" },
];

const DROPDOWN_TABS: ReadonlyArray<{
  id: MediaPanelTab;
  label: string;
  icon: string;
}> = [
  { id: "media-anim", label: "Animation", icon: "film" },
  { id: "media-shape", label: "Shape", icon: "shapes" },
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

  /* ---- Dropdown tab (Animation / Shape) ---- */
  const tabDropdown = el("div", { className: "tab-dropdown" });
  const isDropdownActive =
    state.ui.media.activeTab === "media-anim" ||
    state.ui.media.activeTab === "media-shape";

  const tabDropdownTrigger = el("button", {
    className: `tab tab-dropdown-trigger${isDropdownActive ? " active" : ""}`,
  });

  const activeDropdownDef = DROPDOWN_TABS.find(
    (d) => d.id === state.ui.media.activeTab,
  );
  const tabDropdownLabel = el("span", {
    text: activeDropdownDef?.label ?? "Insert",
  });
  const dropdownChev = createIcon("chevron");
  dropdownChev.style.cssText = "width:10px;height:10px;";
  tabDropdownTrigger.append(tabDropdownLabel, dropdownChev);

  const tabDropdownMenu = el("div", { className: "tab-dropdown-menu" });
  const animTabButton = el("button", { className: "tab-dropdown-item" });
  const animIcon = createIcon("film", "ic");
  animIcon.style.cssText = "width:13px;height:13px;";
  animTabButton.append(animIcon, el("span", { text: "Animation" }));
  animTabButton.dataset["tab"] = "media-anim";

  const shapeTabButton = el("button", { className: "tab-dropdown-item" });
  const shapeIcon = createIcon("shapes", "ic");
  shapeIcon.style.cssText = "width:13px;height:13px;";
  shapeTabButton.append(shapeIcon, el("span", { text: "Shape" }));
  shapeTabButton.dataset["tab"] = "media-shape";

  tabDropdownMenu.append(animTabButton, shapeTabButton);
  tabDropdown.append(tabDropdownTrigger, tabDropdownMenu);
  tabs.append(tabDropdown);
  head.append(tabs);

  /* ---- Search ---- */
  const search = el("div", { className: "search" });
  const searchIcon = createIcon("search", "ic");
  searchIcon.style.cssText = "width:14px;height:14px";

  const searchInput = el("input", {
    attrs: { type: "text", placeholder: "Search assets…" },
  });
  searchInput.value = state.ui.media.searchQuery;

  /* ---- Selection bar (hidden by default) ---- */
  const selectionBar = el("div", { className: "media-selection-bar" });
  selectionBar.hidden = true;

  const selectionCount = el("span", { className: "media-selection-count" });

  const deleteSelectionBtn = el("button", {
    className: "btn small danger",
    text: "Delete",
  });
  deleteSelectionBtn.type = "button";

  selectionBar.append(selectionCount, deleteSelectionBtn);

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

  const animPane = el("div");
  animPane.dataset["pane"] = "media-anim";
  const animContainer = el("div");
  animPane.append(animContainer);
  panes.set("media-anim", animPane);
  body.append(animPane);

  const shapePane = el("div");
  shapePane.dataset["pane"] = "media-shape";
  const shapeContainer = el("div");
  shapePane.append(shapeContainer);
  panes.set("media-shape", shapePane);
  body.append(shapePane);

  panes.forEach((pane, id) => {
    pane.hidden = id !== state.ui.media.activeTab;
  });

  root.append(head, search, selectionBar, body);

  return {
    root,
    tabButtons,
    panes,
    searchInput,
    importButton,
    selectionBar, // ← TAMBAH
    selectionCount, // ← TAMBAH
    deleteSelectionBtn, // ← TAMBAH
    binContainer,
    fxContainer,
    trContainer,
    animContainer,
    tabDropdown,
    tabDropdownTrigger,
    tabDropdownMenu,
    tabDropdownLabel,
    animTabButton,
    shapeTabButton,
    shapeContainer, // ← TAMBAH
  };
}

/* ============================================================
   RENDER: MEDIA BIN
   ============================================================ */

export function renderMediaBin(
  container: HTMLElement,
  assets: readonly MediaAsset[],
  query: string,
  selectedIds: ReadonlySet<string>,
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
      renderThumbsGrid(videoAssets, selectedIds),
    );
  }
  if (audioAssets.length > 0) {
    container.append(
      renderBinLabel("Audio", audioAssets.length),
      renderThumbsGrid(audioAssets, selectedIds),
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

function renderThumbsGrid(
  assets: readonly MediaAsset[],
  selectedIds: ReadonlySet<string> = new Set(),
): HTMLElement {
  const grid = el("div", { className: "thumbs" });
  for (const asset of assets) {
    grid.append(renderThumb(asset, selectedIds.has(asset.id)));
  }
  return grid;
}

function renderThumb(asset: MediaAsset, isSelected: boolean): HTMLElement {
  const thumb = el("div", {
    className: `thumb${isSelected ? " selected" : ""}`,
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
  activeClip: Clip | undefined,
  selectedIds: ReadonlySet<string> = new Set(),
): void {
  clear(container);

  const filteredEffects = filterListEntries(EFFECT_DEFINITIONS, query);
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

  const activeKinds = new Set<string>();
  for (const effect of activeClip?.effects ?? []) {
    if (effect.enabled) activeKinds.add(effect.kind);
  }

  if (builtInMatches) {
    container.append(renderBinLabel("Video Effects", filteredEffects.length));
    for (const effectDef of filteredEffects) {
      const isActive = activeKinds.has(effectDef.kind);
      const item = renderEffectItem(effectDef, isActive);
      container.append(item);
    }
  }

  if (importedMatches) {
    container.append(renderBinLabel("Imported", filteredImages.length));
    container.append(renderThumbsGrid(filteredImages, selectedIds));
  }
}

function renderEffectItem(
  def: { kind: string; name: string; sub: string; gradientIndex: number },
  isActive: boolean,
): HTMLElement {
  const item = el("div", {
    className: `list-item${isActive ? " active" : ""}`,
    attrs: { draggable: "true" },
  });
  item.dataset["effectKind"] = def.kind;
  item.dataset["itemName"] = def.name;

  const swatch = el("div", {
    className: `swatch ${getGradientClass(def.gradientIndex - 1)}`,
  });

  const textWrap = el("div");
  textWrap.append(
    el("div", { className: "li-name", text: def.name }),
    el("div", { className: "li-sub", text: def.sub }),
  );

  item.append(swatch, textWrap);
  return item;
}
/* ============================================================
   RENDER: TRANSITIONS PANE (F14b+)
   ============================================================ */

export function renderTransitionsPane(
  container: HTMLElement,
  assets: readonly MediaAsset[],
  query: string,
  selectedIds: ReadonlySet<string> = new Set(),
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
    container.append(renderThumbsGrid(filteredVideos, selectedIds));
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

/* ============================================================
   ANIMATION PANE (F14af)
   ============================================================ */

/* ============================================================
   ANIMATION PANE (F14af + F14ai)
   ============================================================ */

export function renderAnimationsPane(
  container: HTMLElement,
  query: string,
  activeClip: Clip | undefined,
): void {
  clear(container);

  const clipKind = activeClip?.kind;

  /* Filter by category:
     - No clip → all (exploration mode)
     - Text clip → all (general + text)
     - Video/image clip → only general */
  const available = ANIMATION_DEFINITIONS.filter((def) => {
    if (def.category === "text" && activeClip && clipKind !== "text") {
      return false;
    }
    return true;
  });

  const filtered = filterListEntries(available, query);
  if (filtered.length === 0) {
    container.append(
      el("div", { className: "bin-empty", text: "No items match search" }),
    );
    return;
  }

  const currentKind = activeClip?.animation?.kind ?? null;
  const label = activeClip
    ? `Animations (${filtered.length})`
    : `Animations (${filtered.length})`;
  container.append(renderBinLabel(label, filtered.length));

  for (const def of filtered) {
    container.append(renderAnimationItem(def, def.kind === currentKind));
  }
}

function renderAnimationItem(
  def: AnimationDef,
  isActive: boolean,
): HTMLElement {
  const item = el("div", {
    className: `list-item${isActive ? " active" : ""}`,
    attrs: { draggable: "true" },
  });
  item.dataset["animationKind"] = def.kind;
  item.dataset["itemName"] = def.name;

  const swatch = el("div", {
    className: `swatch ${getGradientClass(def.gradientIndex - 1)}`,
  });

  const textWrap = el("div");
  textWrap.append(
    el("div", { className: "li-name", text: def.name }),
    el("div", { className: "li-sub", text: def.sub }),
  );

  item.append(swatch, textWrap);
  return item;
}

/* ============================================================
   SHAPE PANE (F14aq)
   ============================================================ */
export function renderShapePane(container: HTMLElement, query: string): void {
  clear(container);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? SHAPE_DEFINITIONS.filter((s) => s.name.toLowerCase().includes(q))
    : SHAPE_DEFINITIONS;

  if (filtered.length === 0) {
    container.append(
      el("div", { className: "bin-empty", text: "No items match search" }),
    );
    return;
  }

  container.append(renderBinLabel("Shapes", filtered.length));

  const grid = el("div", { className: "shape-grid" });
  for (const def of filtered) {
    const item = el("button", {
      className: "shape-item",
      attrs: { type: "button" },
    });
    item.dataset["shapeKind"] = def.kind;
    item.title = def.name;

    /* Mini preview SVG */
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.innerHTML = def.svgContent("#7c5cff", "rgba(255,255,255,0.7)", 2);
    item.append(svg);

    const label = el("div", { className: "shape-item-label", text: def.name });
    item.append(label);

    grid.append(item);
  }
  container.append(grid);
}
