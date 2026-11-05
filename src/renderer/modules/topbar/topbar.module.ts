import { renderTopbar } from "./topbar.view";
import { attachMenuController } from "./menu.controller";
import {
  saveProjectFlow,
  openProjectFlow,
  importMediaFlow,
} from "../../app/flows";
import type { MenuActionId } from "./menu.logic";
import * as actions from "@state/actions";
import { appStore } from "@state/appStore";
import { openDialog } from "@core/dialog";
import { eventBus } from "@core/events";

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
      toast("Export video — coming soon", "info");
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
      toast("Sequence settings coming soon", "info");
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
      toast("Documentation coming soon", "info");
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
