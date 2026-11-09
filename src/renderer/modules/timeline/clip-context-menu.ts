import { el, on } from "@core/Dom";
import { EFFECT_DEFINITIONS } from "@modules/effects/effect-definitions";
import type { EffectKind } from "@shared/types/timeline";

/* ============================================================
   CLIP CONTEXT MENU (F14ap)
   ------------------------------------------------------------
   Right-click pada clip → menu dengan:
   - All effects (toggle: klik aktifkan, klik lagi matikan)
   - Reset actions (reset effects, reset color)
   - Clip actions (copy, cut, delete)
   ============================================================ */

const MENU_CLASS = "clip-context-menu";

export function openClipContextMenu(
  anchorEl: HTMLElement,
  activeEffectKinds: ReadonlySet<EffectKind>,
  onEffect: (kind: EffectKind) => void,
  onAction: (id: string) => void,
): void {
  document.querySelector(`.${MENU_CLASS}`)?.remove();

  const menu = el("div", { className: MENU_CLASS });

  /* ---- Section: Effects ---- */
  menu.append(el("div", { className: "clip-ctx-header", text: "Effects" }));

  for (const def of EFFECT_DEFINITIONS) {
    const isActive = activeEffectKinds.has(def.kind);
    const btn = el("button", {
      className: `clip-ctx-item${isActive ? " active" : ""}`,
    });
    btn.type = "button";
    btn.dataset["effectKind"] = def.kind;
    btn.dataset["itemName"] = def.name;

    btn.append(el("span", { className: "clip-ctx-label", text: def.name }));
    if (isActive)
      btn.append(el("span", { className: "clip-ctx-check", text: "✓" }));

    menu.append(btn);
  }

  /* ---- Section: Reset ---- */
  menu.append(el("div", { className: "clip-ctx-sep" }));
  menu.append(el("div", { className: "clip-ctx-header", text: "Reset" }));

  const resetEffects = el("button", { className: "clip-ctx-item" });
  resetEffects.type = "button";
  resetEffects.dataset["actionId"] = "reset-effects";
  resetEffects.append(
    el("span", { className: "clip-ctx-label", text: "Reset All Effects" }),
  );
  menu.append(resetEffects);

  const resetColor = el("button", { className: "clip-ctx-item" });
  resetColor.type = "button";
  resetColor.dataset["actionId"] = "reset-color";
  resetColor.append(
    el("span", { className: "clip-ctx-label", text: "Reset Color Correction" }),
  );
  menu.append(resetColor);

  /* ---- Section: Clip actions ---- */
  menu.append(el("div", { className: "clip-ctx-sep" }));

  const actions: readonly {
    id: string;
    label: string;
    shortcut: string;
    danger?: boolean;
  }[] = [
    { id: "copy", label: "Copy", shortcut: "Ctrl+C" },
    { id: "cut", label: "Cut", shortcut: "Ctrl+X" },
    { id: "delete", label: "Delete", shortcut: "Del", danger: true },
  ];

  for (const a of actions) {
    const btn = el("button", {
      className: `clip-ctx-item${a.danger ? " danger" : ""}`,
    });
    btn.type = "button";
    btn.dataset["actionId"] = a.id;
    btn.append(el("span", { className: "clip-ctx-label", text: a.label }));
    btn.append(
      el("span", { className: "clip-ctx-shortcut", text: a.shortcut }),
    );
    menu.append(btn);
  }

  document.body.append(menu);

  /* ---- Position ---- */
  const rect = anchorEl.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  let left = rect.left + rect.width / 2 - menuRect.width / 2;
  let top = rect.top + 20;

  if (left + menuRect.width > window.innerWidth - 8) {
    left = window.innerWidth - menuRect.width - 8;
  }
  if (left < 8) left = 8;
  if (top + menuRect.height > window.innerHeight - 8) {
    top = rect.top - menuRect.height - 8;
    if (top < 8) top = 8;
  }

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  /* ---- Handlers ---- */
  const cleanups: Array<() => void> = [];

  const close = (): void => {
    cleanups.forEach((fn) => fn());
    menu.remove();
  };

  cleanups.push(
    on(menu, "click", (ev) => {
      const target = ev.target as Element;
      const btn = target.closest<HTMLElement>(".clip-ctx-item");
      if (!btn) return;

      const kind = btn.dataset["effectKind"] as EffectKind | undefined;
      const actionId = btn.dataset["actionId"];

      if (kind) onEffect(kind);
      else if (actionId) onAction(actionId);
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
