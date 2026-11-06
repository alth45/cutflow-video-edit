import { el, on } from "@core/Dom";
import { createIcon } from "@core/icons";

/* ============================================================
   CUSTOM DROPDOWN
   ------------------------------------------------------------
   Reusable dropdown (non-native). Bisa style item individually
   (e.g., font dropdown menampilkan tiap font dengan font-nya
   sendiri).
   ============================================================ */

export interface DropdownItem {
  readonly value: string;
  readonly label: string;
  /** CSS inline untuk preview item (mis. font-family). */
  readonly style?: string;
}

export interface DropdownOptions {
  readonly items: readonly DropdownItem[];
  readonly value: string;
  readonly onChange: (value: string) => void;
}

export interface DropdownHandle {
  readonly element: HTMLElement;
  readonly setValue: (value: string) => void;
  readonly getValue: () => string;
}

export function createDropdown(opts: DropdownOptions): DropdownHandle {
  let currentValue = opts.value;
  let menuOpen = false;
  let cleanups: Array<() => void> = [];

  const root = el("div", { className: "custom-select" });

  const trigger = el("button", { className: "custom-select-trigger" });
  trigger.type = "button";
  trigger.setAttribute("aria-haspopup", "listbox");

  const triggerLabel = el("span", { className: "custom-select-label" });
  const triggerChev = createIcon("chevron");
  triggerChev.classList.add("custom-select-chev");

  trigger.append(triggerLabel, triggerChev);
  root.append(trigger);

  const menu = el("div", { className: "custom-select-menu" });
  menu.setAttribute("role", "listbox");
  root.append(menu);

  function findItem(value: string): DropdownItem | undefined {
    return opts.items.find((i) => i.value === value);
  }

  function refreshTrigger(): void {
    const item = findItem(currentValue);
    triggerLabel.textContent = item?.label ?? currentValue;
    if (item?.style) {
      triggerLabel.style.cssText = item.style;
    } else {
      triggerLabel.style.cssText = "";
    }
  }

  function closeMenu(): void {
    if (!menuOpen) return;
    menuOpen = false;
    menu.classList.remove("open");
    cleanups.forEach((fn) => fn());
    cleanups = [];
  }

  function openMenu(): void {
    if (menuOpen) return;
    menuOpen = true;
    menu.classList.add("open");
    cleanups.push(
      on(document, "mousedown", (ev) => {
        if (!root.contains(ev.target as Node)) closeMenu();
      }),
    );
    cleanups.push(
      on(document, "keydown", (ev) => {
        if (ev.key === "Escape") {
          ev.preventDefault();
          closeMenu();
        }
      }),
    );
  }

  /* Build items */
  function rebuild(): void {
    menu.replaceChildren();
    for (const item of opts.items) {
      const btn = el("button", { className: "custom-select-item" });
      btn.type = "button";
      btn.dataset["value"] = item.value;
      btn.setAttribute("role", "option");

      const label = el("span", { text: item.label });
      if (item.style) label.style.cssText = item.style;
      btn.append(label);

      if (item.value === currentValue) {
        btn.classList.add("current");
        const check = createIcon("check", "ic custom-select-check");
        btn.append(check);
      }

      menu.append(btn);
    }
  }

  trigger.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (menuOpen) closeMenu();
    else {
      rebuild();
      openMenu();
    }
  });

  on(menu, "click", (ev) => {
    const target = ev.target as Element;
    const btn = target.closest<HTMLElement>(".custom-select-item");
    if (!btn) return;
    const value = btn.dataset["value"];
    if (!value) return;
    currentValue = value;
    refreshTrigger();
    closeMenu();
    opts.onChange(value);
  });

  refreshTrigger();

  return {
    element: root,
    setValue: (v: string) => {
      currentValue = v;
      refreshTrigger();
    },
    getValue: () => currentValue,
  };
}
