import { on, delegate } from "@core/Dom";
import {
  isMenuOpen,
  nextOpenMenu,
  type MenuId,
  type MenuActionId,
} from "./menu.logic";
import type { TopbarView } from "./topbar.view";

/**
 * Attach event listeners untuk menu behavior + action buttons.
 *
 * @param view — references dari `renderTopbar()`
 * @param container — elemen `.topbar` (mount point) untuk click-outside detection
 * @param onAction — callback ketika menu action / button dipilih
 */
export function attachMenuController(
  view: TopbarView,
  container: HTMLElement,
  onAction: (actionId: MenuActionId) => void,
): () => void {
  let openMenuId: MenuId | null = null;

  function applyOpenState(): void {
    for (const [id, el] of view.menuContainers) {
      const isOpen = isMenuOpen(openMenuId, id);
      el.classList.toggle("open", isOpen);
      view.menuTriggers.get(id)?.setAttribute("aria-expanded", String(isOpen));
    }
  }

  function setOpen(id: MenuId | null): void {
    if (openMenuId === id) return;
    openMenuId = id;
    applyOpenState();
  }

  /* Trigger clicks */
  const triggerCleanups = [...view.menuTriggers.entries()].map(
    ([id, trigger]) =>
      on(trigger, "click", (ev) => {
        ev.stopPropagation();
        setOpen(nextOpenMenu(openMenuId, id));
      }),
  );

  /* Menu item clicks — delegation untuk handle 20+ items dengan 1 listener */
  const itemCleanup = delegate(
    view.menubar,
    "click",
    ".dropdown button[data-action-id]",
    (ev, btn) => {
      ev.stopPropagation();
      const actionId = (btn as HTMLElement).dataset["actionId"] as
        | MenuActionId
        | undefined;
      setOpen(null);
      if (actionId) onAction(actionId);
    },
  );

  /* ---- Close on outside click ----
   Cek terhadap `view.menubar` (bukan `container` = topbar)
   supaya klik pada action button (undo/redo/export) ikut
   menutup menu — perilaku standard: klik tombol topbar lain
   = keluar dari menu aktif. */
  const outsideCleanup = on(document, "click", (ev) => {
    if (!view.menubar.contains(ev.target as Node)) setOpen(null);
  });

  /* Escape */
  const escapeCleanup = on(document, "keydown", (ev) => {
    if (ev.key === "Escape") setOpen(null);
  });

  /* Action buttons */
  const undoCleanup = on(view.actionButtons.undo, "click", () =>
    onAction("edit:undo"),
  );
  const redoCleanup = on(view.actionButtons.redo, "click", () =>
    onAction("edit:redo"),
  );
  const exportCleanup = on(view.actionButtons.export, "click", () =>
    onAction("file:export"),
  );

  return () => {
    triggerCleanups.forEach((fn) => fn());
    itemCleanup();
    outsideCleanup();
    escapeCleanup();
    undoCleanup();
    redoCleanup();
    exportCleanup();
  };
}
