import { el } from "@core/Dom";
import { createIcon } from "@core/icons";
import { MENU_DEFINITIONS, type MenuId } from "./menu.logic";

export interface TopbarView {
  /** Elements yang harus di-append ke container `.topbar`. */
  readonly brand: HTMLElement;
  readonly menubar: HTMLElement;
  readonly topbarRight: HTMLElement;
  readonly menuTriggers: ReadonlyMap<MenuId, HTMLButtonElement>;
  readonly menuContainers: ReadonlyMap<MenuId, HTMLElement>;
  readonly actionButtons: {
    readonly undo: HTMLButtonElement;
    readonly redo: HTMLButtonElement;
    readonly export: HTMLButtonElement;
  };
}

export function renderTopbar(): TopbarView {
  /* ---------- Brand ---------- */
  const brand = el("div", { className: "brand" });
  const logo = el("div", { className: "logo" });
  logo.append(createIcon("play"));
  brand.append(logo, el("span", { text: "CutFlow" }));

  /* ---------- Menubar ---------- */
  const menubar = el("nav", { className: "menubar" });
  const menuTriggers = new Map<MenuId, HTMLButtonElement>();
  const menuContainers = new Map<MenuId, HTMLElement>();

  for (const def of MENU_DEFINITIONS) {
    const menuEl = el("div", { className: "menu" });

    const trigger = el("button", { className: "menu-btn", text: def.label });
    trigger.setAttribute("aria-haspopup", "true");
    trigger.setAttribute("aria-expanded", "false");

    const dropdown = el("div", { className: "dropdown" });
    dropdown.setAttribute("role", "menu");

    for (const item of def.items) {
      if (item.kind === "separator") {
        dropdown.append(el("div", { className: "sep" }));
      } else {
        const btn = el("button");
        btn.setAttribute("role", "menuitem");
        btn.dataset["actionId"] = item.id;

        btn.append(el("span", { text: item.label, className: "menu-label" }));
        if (item.shortcut) btn.append(el("span", { text: item.shortcut }));
        dropdown.append(btn);
      }
    }

    menuEl.append(trigger, dropdown);
    menubar.append(menuEl);

    menuTriggers.set(def.id, trigger);
    menuContainers.set(def.id, menuEl);
  }

  /* ---------- Topbar right ---------- */
  const topbarRight = el("div", { className: "topbar-right" });

  const undoBtn = el("button", { className: "icon-btn" });
  undoBtn.title = "Undo";
  undoBtn.append(createIcon("undo"));

  const redoBtn = el("button", { className: "icon-btn" });
  redoBtn.title = "Redo";
  redoBtn.append(createIcon("redo"));

  const divider = el("span", { className: "divider" });

  const exportBtn = el("button", { className: "btn primary" });
  const exportIcon = createIcon("download");
  exportIcon.style.cssText = "width:14px;height:14px";
  exportBtn.append(exportIcon, el("span", { text: "Export" }));

  topbarRight.append(undoBtn, redoBtn, divider, exportBtn);

  return {
    brand,
    menubar,
    topbarRight,
    menuTriggers,
    menuContainers,
    actionButtons: { undo: undoBtn, redo: redoBtn, export: exportBtn },
  };
}
