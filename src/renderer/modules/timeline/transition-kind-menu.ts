import { el, on } from "@core/Dom";
import { createIcon, type IconName } from "@core/icons";
import type { TransitionKind } from "@shared/types/timeline";

/* ============================================================
   TRANSITION KIND MENU
   ------------------------------------------------------------
   Floating popup menu untuk memilih jenis transition. Muncul
   saat user right-click pada transition box.

   Dismiss: Escape, klik di luar, atau pilih item.
   Posisi: kanan anchor box, flip ke kiri kalau overflow.
   ============================================================ */

interface MenuItem {
  readonly kind: TransitionKind;
  readonly label: string;
  readonly icon: IconName;
}

const ITEMS: readonly MenuItem[] = [
  { kind: "cross-dissolve", label: "Cross Dissolve", icon: "blend" },
  { kind: "dip-to-black", label: "Dip to Black", icon: "moon" },
  { kind: "dip-to-white", label: "Dip to White", icon: "sun" },
  { kind: "slide", label: "Slide (H)", icon: "arrow-right" },
  { kind: "slide-vertical", label: "Slide (V)", icon: "arrow-down" },
  { kind: "wipe", label: "Wipe", icon: "move-horizontal" },
  { kind: "circle-wipe", label: "Circle Wipe", icon: "outline" },
  { kind: "barn-doors", label: "Barn Doors", icon: "columns" },
  { kind: "zoom-blur", label: "Zoom Blur", icon: "fullscreen" },
  { kind: "cross-zoom", label: "Cross Zoom", icon: "zoom-in" },
];

const MENU_CLASS = "transition-kind-menu";

export function openTransitionKindMenu(
  anchorEl: HTMLElement,
  currentKind: TransitionKind | null,
  onPick: (kind: TransitionKind) => void,
  onDelete?: () => void,
): void {
  document.querySelector(`.${MENU_CLASS}`)?.remove();

  const menu = el("div", { className: MENU_CLASS });

  for (const item of ITEMS) {
    const isCurrent = item.kind === currentKind;
    const btn = el("button", {
      className: `transition-kind-item${isCurrent ? " current" : ""}`,
    });
    btn.type = "button";
    btn.dataset["kind"] = item.kind;

    btn.append(createIcon(item.icon), el("span", { text: item.label }));
    if (isCurrent) btn.append(el("span", { className: "check", text: "✓" }));

    menu.append(btn);
  }

  if (currentKind && onDelete) {
    menu.append(el("div", { className: "transition-kind-sep" }));
    const delBtn = el("button", { className: "transition-kind-item danger" });
    delBtn.type = "button";
    delBtn.dataset["action"] = "delete";
    delBtn.append(
      createIcon("trash"),
      el("span", { text: "Remove Transition" }),
    );
    menu.append(delBtn);
  }

  document.body.append(menu);

  /* Position */
  const rect = anchorEl.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  let left = rect.right + 8;
  let top = rect.top + rect.height / 2 - menuRect.height / 2;

  if (left + menuRect.width > window.innerWidth - 8) {
    left = rect.left - menuRect.width - 8;
  }
  if (top < 8) top = 8;
  if (top + menuRect.height > window.innerHeight - 8) {
    top = window.innerHeight - menuRect.height - 8;
  }
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  /* Dismiss handlers */
  const cleanups: Array<() => void> = [];

  function close(): void {
    cleanups.forEach((fn) => fn());
    menu.remove();
  }

  cleanups.push(
    on(menu, "click", (ev) => {
      const target = ev.target as Element;
      const btn = target.closest<HTMLElement>(".transition-kind-item");
      if (!btn) return;
      const action = btn.dataset["action"];
      const kind = btn.dataset["kind"] as TransitionKind | undefined;
      if (action === "delete" && onDelete) {
        onDelete();
      } else if (kind) {
        onPick(kind);
      }
      close();
    }),
  );

  cleanups.push(
    on(document, "mousedown", (ev) => {
      if (!menu.contains(ev.target as Node)) close();
    }),
  );

  cleanups.push(
    on(document, "keydown", (ev) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        close();
      }
    }),
  );
}
