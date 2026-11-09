import { renderTopbar } from "./topbar.view";
import { attachMenuController } from "./menu.controller";
import {
  saveProjectFlow,
  openProjectFlow,
  importMediaFlow,
  exportVideoFlow,
} from "../../app/flows";
import type { MenuActionId } from "./menu.logic";
import * as actions from "@state/actions";
import { appStore } from "@state/appStore";
import { openDialog } from "@core/dialog";
import { eventBus } from "@core/events";
import { openSequenceSettings } from "@modules/sequence/sequence-settings.modal";
import { getContentDurationSec } from "@state/selectors";

function toast(
  message: string,
  tone: "info" | "success" | "warning" | "error" = "info",
): void {
  eventBus.emit("toast:show", { message, tone });
}

export function mountTopbar(container: HTMLElement): () => void {
  const view = renderTopbar();
  container.append(view.brand, view.menubar, view.topbarRight);

  const detach = attachMenuController(view, container, handleAction);

  return () => {
    detach();
    container.replaceChildren();
  };
}

function handleAction(id: MenuActionId): void {
  switch (id) {
    /* ---- FILE ---- */
    case "file:new": {
      if (appStore.getState().isDirty) {
        if (!window.confirm("Discard unsaved changes?")) return;
      }
      actions.newProject();
      toast("New project created", "success");
      return;
    }

    case "file:save":
      void saveProjectFlow();
      return;

    case "file:open":
      void openProjectFlow();
      return;

    case "file:import":
      void importMediaFlow();
      return;

    case "file:export":
      void exportVideoFlow();
      return;

    /* ---- EDIT ---- */
    case "edit:undo":
      actions.undo();
      return;

    case "edit:redo":
      actions.redo();
      return;

    case "edit:cut":
      actions.cutSelection();
      return;

    case "edit:copy":
      actions.copySelection();
      return;

    case "edit:paste":
      actions.pasteAtPlayhead();
      return;

    /* ---- VIEW ---- */
    case "view:media-panel":
      actions.toggleLayoutPanel("media");
      return;

    case "view:inspector":
      actions.toggleLayoutPanel("inspector");
      return;

    case "view:timeline":
      actions.toggleLayoutPanel("timeline");
      return;

    case "view:fullscreen":
      actions.togglePreviewFullscreen();
      return;

    /* ---- CLIP ---- */
    case "clip:speed":
      if (appStore.getState().selection.selectedClipIds.length === 0) {
        toast("Select a clip first", "warning");
        return;
      }
      actions.setInspectorTab("insp-video");
      toast("Speed adjustment coming soon", "info");
      return;

    case "clip:transition":
      toast("Click a junction between clips to add a transition", "info");
      return;

    case "clip:nest":
      toast("Nest clip coming soon", "info");
      return;

    /* ---- SEQUENCE ---- */
    case "seq:render":
      toast("Render coming soon — use File → Export", "info");
      return;

    case "seq:settings":
      void handleSequenceSettings();
      return;

    case "seq:add-track":
      actions.addTrack("video");
      toast("Video track added", "success");
      return;

    /* ---- HELP ---- */
    case "help:shortcuts":
      void showShortcutsDialog();
      return;

    case "help:docs":
      void showDocumentationDialog();
      return;

    case "help:about":
      void showAboutDialog();
      return;

    default:
      // eslint-disable-next-line no-console
      console.info(`[topbar] unhandled action: ${id}`);
  }
}

/* ============================================================
   HELP DIALOGS
   ============================================================ */

async function showShortcutsDialog(): Promise<void> {
  const shortcuts = [
    ["Save project", "Ctrl+S"],
    ["Open project", "Ctrl+O"],
    ["Import media", "Ctrl+I"],
    ["Export video", "Ctrl+E"],
    ["Undo", "Ctrl+Z"],
    ["Redo", "Ctrl+Shift+Z / Ctrl+Y"],
    ["Copy", "Ctrl+C"],
    ["Cut", "Ctrl+X"],
    ["Paste", "Ctrl+V"],
    ["Delete selected", "Delete"],
    ["Split clip at playhead", "Ctrl+K"],
    ["Play / Pause", "Space"],
    ["Step back / forward", "← / →"],
    ["Jump to start / end", "Home / End"],
    ["Fullscreen preview", "F"],
    ["Close dialog / menu", "Escape"],
  ];

  const rows = shortcuts
    .map(([label, key]) => {
      const kbdParts = (key ?? "")
        .split(" / ")
        .map((k) => `<kbd>${k}</kbd>`)
        .join(" / ");
      return `<tr><td>${label}</td><td>${kbdParts}</td></tr>`;
    })
    .join("");

  await openDialog({
    title: "Keyboard Shortcuts",
    content: `<table>${rows}</table>`,
    confirmLabel: "Close",
  });
}

async function showAboutDialog(): Promise<void> {
  const info = window.cutflow.app;
  await openDialog({
    title: "About CutFlow",
    content: `
      <div style="text-align:center;padding:8px 0 4px">
        <div style="width:42px;height:42px;border-radius:11px;margin:0 auto 12px;
                    display:grid;place-items:center;
                    background:linear-gradient(135deg,var(--accent),var(--accent-2));
                    box-shadow:var(--shadow-accent)">
          <svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:#fff">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </div>
        <div style="font-size:16px;font-weight:700;color:var(--text);letter-spacing:0.3px">
          CutFlow
        </div>
        <div style="font-size:11px;color:var(--muted-2);margin-top:2px">
          Version ${info.version}
        </div>
      </div>
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--line-soft);
                  font-size:12px;color:var(--muted);line-height:1.7">
        A modular video editor built with Electron + TypeScript.
      </div>
      <table style="margin-top:10px">
        <tr><td>Electron</td><td>${info.electron}</td></tr>
        <tr><td>Platform</td><td>${info.platform}</td></tr>
        <tr><td>Build</td><td>${info.isPackaged ? "production" : "development"}</td></tr>
      </table>
    `,
    confirmLabel: "Close",
  });
}

/* ============================================================
   HELP → DOCUMENTATION (F14ar)
   ------------------------------------------------------------
   Offline documentation modal. Structured sections dengan
   inline code + kbd shortcuts. Read-only, tutup via OK/Escape.
   ============================================================ */

async function showDocumentationDialog(): Promise<void> {
  await openDialog({
    title: "CutFlow Documentation",
    content: `
      <div class="doc-body">

        <h3>Getting Started</h3>
        <ul>
          <li><b>Import media</b> — <kbd>Ctrl+I</kbd> atau tombol <code>+</code> di panel Media.</li>
          <li><b>Add to timeline</b> — Tarik thumbnail dari bin ke track video atau audio.</li>
          <li><b>Playback</b> — <kbd>Space</kbd> untuk play/pause, <kbd>←</kbd> / <kbd>→</kbd> untuk step frame, <kbd>Home</kbd> / <kbd>End</kbd> ke awal/akhir.</li>
        </ul>

        <h3>Editing Clips</h3>
        <ul>
          <li><b>Move clip</b> — Drag clip ke kiri/kanan. Snap otomatis ke clip edge, playhead, dan boundary.</li>
          <li><b>Trim clip</b> — Drag tepi kanan clip untuk ubah durasi. Video/audio dibatasi durasi sumber.</li>
          <li><b>Split clip</b> — <kbd>Ctrl+K</kbd> di playhead, atau pilih <b>Razor tool</b> lalu klik clip.</li>
          <li><b>Delete</b> — <kbd>Del</kbd> atau <kbd>Backspace</kbd>.</li>
          <li><b>Multi-select</b> — <kbd>Ctrl+Click</kbd> untuk tambah, <kbd>Shift+Click</kbd> untuk range, drag di empty area untuk marquee.</li>
        </ul>

        <h3>Effects &amp; Color</h3>
        <ul>
          <li><b>Effects tab</b> — Klik item untuk apply/toggle (22 efek: blur, sharpen, glow, HDR, vintage, cinematic, dll.).</li>
          <li><b>Quick access</b> — Right-click clip di timeline → semua efek + reset actions.</li>
          <li><b>Color correction</b> — Inspector <b>Color</b> tab: exposure, contrast, saturation, temp, curve editor.</li>
          <li><b>Green screen</b> — Inspector <b>Video</b> → Chroma Key group → pilih Green/Blue + similarity.</li>
        </ul>

        <h3>Animation</h3>
        <ul>
          <li><b>Animation tab</b> — Klik animasi untuk toggle (shake, glitch, pulse, spin, dll.).</li>
          <li><b>Text-specific</b> — Typewriter dan Neon Text (hanya muncul untuk text clip).</li>
        </ul>

        <h3>Transitions</h3>
        <ul>
          <li><b>Add transition</b> — Klik kotak di junction antara dua clip adjacent.</li>
          <li><b>Change kind</b> — Right-click kotak transition → pilih dari 10 jenis (cross-dissolve, slide, wipe, circle, dll.).</li>
          <li><b>Remove</b> — Klik kotak lalu tekan <kbd>Del</kbd>.</li>
        </ul>

        <h3>Text &amp; Shapes</h3>
        <ul>
          <li><b>Create text</b> — <b>Text tool</b> (<kbd>T</kbd>) → klik pada video track.</li>
          <li><b>Edit text</b> — Double-click text clip. Modal untuk content + font + bold/italic/underline/stroke.</li>
          <li><b>Insert shape</b> — <code>[Insert ▼]</code> dropdown di tab bar → <b>Shape</b> → klik geometri.</li>
          <li><b>Drag overlay</b> — Pilih clip → drag selection box di preview untuk position, drag corner handles untuk scale.</li>
        </ul>

        <h3>Keyframes</h3>
        <ul>
          <li><b>Per property</b> — Klik tombol ◆ di kiri slider (Position X/Y, Scale, Rotation, Opacity).</li>
          <li><b>All properties</b> — Klik tombol ◆ di toolbar timeline (add keyframe untuk semua 5 properties sekaligus).</li>
          <li><b>Animate</b> — Drag slider saat ada keyframe → auto-add/update keyframe di playhead.</li>
        </ul>

        <h3>Saving &amp; Export</h3>
        <ul>
          <li><b>Save project</b> — <kbd>Ctrl+S</kbd>. Format <code>.cutflow.json</code>.</li>
          <li><b>Open project</b> — <kbd>Ctrl+O</kbd>.</li>
          <li><b>Export MP4</b> — <kbd>Ctrl+E</kbd> atau tombol <b>Export</b> di topbar. Render frame-accurate (H.264 + AAC).</li>
          <li><b>Undo/Redo</b> — <kbd>Ctrl+Z</kbd> / <kbd>Ctrl+Shift+Z</kbd> (atau <kbd>Ctrl+Y</kbd>).</li>
        </ul>

      </div>
    `,
    confirmLabel: "Close",
  });
}

/* ============================================================
   SEQUENCE SETTINGS
   ============================================================ */
async function handleSequenceSettings(): Promise<void> {
  const state = appStore.getState();

  const updates = await openSequenceSettings({
    sequence: state.project.sequence,
    contentEndSec: getContentDurationSec(state),
  });
  if (!updates) return;

  const result = actions.updateSequenceSettings(updates);

  if (!result.ok) {
    toast(result.error, "error");
    return;
  }

  toast("Sequence updated", "success");
}
