/* ============================================================
   MENU LOGIC
   ------------------------------------------------------------
   Data definitions untuk menu topbar + pure helper functions.

   Data-driven: menambah/mengubah menu item = edit array di sini
   saja. View tinggal iterate `MENU_DEFINITIONS`.
   ============================================================ */

export type MenuId = "file" | "edit" | "view" | "clip" | "sequence" | "help";

/** ID unik untuk setiap action menu. Union literal → type-safe. */
export type MenuActionId =
  | "file:new"
  | "file:open"
  | "file:save"
  | "file:import"
  | "file:export"
  | "edit:undo"
  | "edit:redo"
  | "edit:cut"
  | "edit:copy"
  | "edit:paste"
  | "view:media-panel"
  | "view:inspector"
  | "view:timeline"
  | "view:fullscreen"
  | "clip:speed"
  | "clip:transition"
  | "clip:nest"
  | "seq:render"
  | "seq:settings"
  | "seq:add-track"
  | "help:shortcuts"
  | "help:docs"
  | "help:about";

export type MenuItem =
  | {
      readonly kind: "action";
      readonly id: MenuActionId;
      readonly label: string;
      readonly shortcut?: string;
    }
  | { readonly kind: "separator" };

export interface MenuDefinition {
  readonly id: MenuId;
  readonly label: string;
  readonly items: readonly MenuItem[];
}

export const MENU_DEFINITIONS: readonly MenuDefinition[] = [
  {
    id: "file",
    label: "File",
    items: [
      {
        kind: "action",
        id: "file:new",
        label: "New Project",
        shortcut: "Ctrl+N",
      },
      {
        kind: "action",
        id: "file:open",
        label: "Open Project",
        shortcut: "Ctrl+O",
      },
      {
        kind: "action",
        id: "file:save",
        label: "Save Project",
        shortcut: "Ctrl+S",
      },
      { kind: "separator" },
      {
        kind: "action",
        id: "file:import",
        label: "Import Media",
        shortcut: "Ctrl+I",
      },
      {
        kind: "action",
        id: "file:export",
        label: "Export Video",
        shortcut: "Ctrl+E",
      },
    ],
  },
  {
    id: "edit",
    label: "Edit",
    items: [
      { kind: "action", id: "edit:undo", label: "Undo", shortcut: "Ctrl+Z" },
      {
        kind: "action",
        id: "edit:redo",
        label: "Redo",
        shortcut: "Ctrl+Y",
      },

      { kind: "separator" },
      { kind: "action", id: "edit:cut", label: "Cut", shortcut: "Ctrl+X" },
      { kind: "action", id: "edit:copy", label: "Copy", shortcut: "Ctrl+C" },
      { kind: "action", id: "edit:paste", label: "Paste", shortcut: "Ctrl+V" },
    ],
  },
  {
    id: "view",
    label: "View",
    items: [
      {
        kind: "action",
        id: "view:media-panel",
        label: "Media Panel",
        shortcut: "Alt+1",
      },
      {
        kind: "action",
        id: "view:inspector",
        label: "Inspector",
        shortcut: "Alt+2",
      },
      {
        kind: "action",
        id: "view:timeline",
        label: "Timeline",
        shortcut: "Alt+3",
      },
      { kind: "separator" },
      {
        kind: "action",
        id: "view:fullscreen",
        label: "Fullscreen Preview",
        shortcut: "F",
      },
    ],
  },
  {
    id: "clip",
    label: "Clip",
    items: [
      {
        kind: "action",
        id: "clip:speed",
        label: "Speed / Duration",
        shortcut: "Ctrl+R",
      },
      {
        kind: "action",
        id: "clip:transition",
        label: "Add Transition",
        shortcut: "Ctrl+D",
      },
      { kind: "action", id: "clip:nest", label: "Nest Clip" },
    ],
  },
  {
    id: "sequence",
    label: "Sequence",
    items: [
      { kind: "action", id: "seq:render", label: "Render In to Out" },
      { kind: "action", id: "seq:settings", label: "Sequence Settings" },
      { kind: "action", id: "seq:add-track", label: "Add Track" },
    ],
  },
  {
    id: "help",
    label: "Help",
    items: [
      {
        kind: "action",
        id: "help:shortcuts",
        label: "Keyboard Shortcuts",
        shortcut: "Ctrl+/",
      },
      { kind: "action", id: "help:docs", label: "Documentation" },
      { kind: "action", id: "help:about", label: "About CutFlow" },
    ],
  },
];

/* ============================================================
   PURE HELPERS
   ============================================================ */

/** Apakah `target` harus dianggap "open" berdasarkan state saat ini. */
export function isMenuOpen(openMenuId: MenuId | null, target: MenuId): boolean {
  return openMenuId === target;
}

/**
 * Hitung next open-menu berdasarkan klik pada trigger.
 *
 * Aturan: klik trigger yang SAMA → tutup (toggle). Klik trigger
 * berbeda → switch ke menu baru (tanpa menutup dulu).
 */
export function nextOpenMenu(
  current: MenuId | null,
  clicked: MenuId,
): MenuId | null {
  return current === clicked ? null : clicked;
}
