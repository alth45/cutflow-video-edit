/* ============================================================
   KEYBOARD SHORTCUTS — DATA & MATCHER
   ------------------------------------------------------------
   Pure data: array shortcut + fungsi match. Modul listener
   ada di `keyboard.module.ts`.

   Pakai `ev.code` (bukan `ev.key`) untuk layout-independence:
   `ev.code` = posisi fisik key (QWERTY-based), konsisten di
   semua keyboard layout. `ev.key` berubah sesuai layout
   (mis. AZERTY KeyZ = physical 'W').

   Untuk key khusus (Space, Delete, Arrow*), `ev.code` sama
   dengan nama logis — tidak ada konflik.
   ============================================================ */

export type ShortcutAction =
  | { readonly type: "toggle-play" }
  | { readonly type: "step-frame"; readonly delta: 1 | -1 }
  | { readonly type: "goto-start" }
  | { readonly type: "goto-end" }
  | { readonly type: "delete-clip" }
  | { readonly type: "undo" }
  | { readonly type: "redo" }
  | { readonly type: "split-at-playhead" }
  | { readonly type: "copy" }
  | { readonly type: "cut" }
  | { readonly type: "paste" }
  | { readonly type: "toggle-fullscreen" }
  | { readonly type: "placeholder"; readonly id: string };

export interface Shortcut {
  readonly match: (ev: KeyboardEvent) => boolean;
  readonly action: ShortcutAction;
  /** `preventDefault()` saat match — cegah default browser (scroll, save page, dll.). */
  readonly preventDefault: boolean;
}

const isPrimary = (ev: KeyboardEvent): boolean => ev.ctrlKey || ev.metaKey;

export const SHORTCUTS: readonly Shortcut[] = [
  /* Playback */
  {
    match: (ev) => ev.code === "Space",
    action: { type: "toggle-play" },
    preventDefault: true,
  },
  {
    match: (ev) => ev.code === "ArrowLeft",
    action: { type: "step-frame", delta: -1 },
    preventDefault: true,
  },
  {
    match: (ev) => ev.code === "ArrowRight",
    action: { type: "step-frame", delta: 1 },
    preventDefault: true,
  },
  {
    match: (ev) => ev.code === "Home",
    action: { type: "goto-start" },
    preventDefault: true,
  },
  {
    match: (ev) => ev.code === "End",
    action: { type: "goto-end" },
    preventDefault: true,
  },
  {
    match: (ev) =>
      ev.code === "KeyF" && !isPrimary(ev) && !ev.altKey && !ev.shiftKey,
    action: { type: "toggle-fullscreen" },
    preventDefault: true,
  },

  /* Clip */
  {
    match: (ev) => ev.code === "Delete" || ev.code === "Backspace",
    action: { type: "delete-clip" },
    preventDefault: false,
  },

  {
    match: (ev) => isPrimary(ev) && ev.code === "KeyK",
    action: { type: "split-at-playhead" },
    preventDefault: true,
  },

  /* File / Edit — placeholder sampai F13 */
  /* File / Edit */
  {
    match: (ev) => isPrimary(ev) && ev.code === "KeyS",
    action: { type: "placeholder", id: "save" },
    preventDefault: true,
  },
  {
    match: (ev) => isPrimary(ev) && ev.code === "KeyO",
    action: { type: "placeholder", id: "open" },
    preventDefault: true,
  },
  {
    match: (ev) => isPrimary(ev) && ev.code === "KeyZ" && !ev.shiftKey,
    action: { type: "undo" },
    preventDefault: true,
  },
  {
    match: (ev) => isPrimary(ev) && ev.code === "KeyZ" && ev.shiftKey,
    action: { type: "redo" },
    preventDefault: true,
  },
  {
    match: (ev) => isPrimary(ev) && ev.code === "KeyY",
    action: { type: "redo" },
    preventDefault: true,
  },
  {
    match: (ev) => isPrimary(ev) && ev.code === "KeyI",
    action: { type: "placeholder", id: "import" },
    preventDefault: true,
  },
  {
    match: (ev) => isPrimary(ev) && ev.code === "KeyE",
    action: { type: "placeholder", id: "export" },
    preventDefault: true,
  },
  {
    match: (ev) => isPrimary(ev) && ev.code === "KeyC",
    action: { type: "copy" },
    preventDefault: true,
  },
  {
    match: (ev) => isPrimary(ev) && ev.code === "KeyX",
    action: { type: "cut" },
    preventDefault: true,
  },
  {
    match: (ev) => isPrimary(ev) && ev.code === "KeyV",
    action: { type: "paste" },
    preventDefault: true,
  },
  {
    match: (ev) => isPrimary(ev) && ev.code === "KeyO",
    action: { type: "placeholder", id: "open" },
    preventDefault: true,
  },
];
