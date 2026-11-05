import { qsRequired, el, clear } from "@core/Dom";

/* ============================================================
   APP SHELL
   ------------------------------------------------------------
   Membuat struktur grid utama `.app` dan 5 mount point:

     <div class="app">
       <header class="topbar"    id="mount-topbar">   ← F7b
       <aside  class="panel media"     id="mount-media">    ← F8
       <section class="preview"       id="mount-preview"> ← F9
       <aside  class="panel inspector" id="mount-inspector"> ← F10
       <section class="timeline"      id="mount-timeline">  ← F11
     </div>

   Setiap mount point:
   - Memakai class yang SAMA dengan CSS (layout.css + components)
     → styling otomatis dari CSS yang sudah kita tulis di F6.
   - Grid area assignment berasal dari class (`.topbar` → `grid-area: top`,
     `.media` → `grid-area: media`, dst.).
   - Module F7b+ tinggal `mount.innerHTML = '...'` atau DOM ops.

   App.ts TIDAK tahu tentang modul. Modul yang tahu harus
   mount di mana.
   ============================================================ */

export interface AppMounts {
  readonly topbar: HTMLElement;
  readonly media: HTMLElement;
  readonly preview: HTMLElement;
  readonly inspector: HTMLElement;
  readonly timeline: HTMLElement;
}

export interface AppShell {
  readonly root: HTMLElement;
  readonly mounts: AppMounts;
}

/**
 * Buat shell grid. Meng-clear `#app` (menghapus `#boot` placeholder
 * dari `index.html`) lalu render struktur `.app`.
 */
export function createAppShell(): AppShell {
  const root = qsRequired("#app");
  clear(root);

  const app = el("div", { className: "app" });

  const topbar = el("header", { className: "topbar", id: "mount-topbar" });
  const media = el("aside", { className: "panel media", id: "mount-media" });
  const preview = el("section", { className: "preview", id: "mount-preview" });
  const inspector = el("aside", {
    className: "panel inspector",
    id: "mount-inspector",
  });
  const timeline = el("section", {
    className: "timeline",
    id: "mount-timeline",
  });

  app.append(topbar, media, preview, inspector, timeline);
  root.append(app);

  return {
    root: app,
    mounts: { topbar, media, preview, inspector, timeline },
  };
}
