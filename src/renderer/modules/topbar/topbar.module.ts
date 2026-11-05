import { renderTopbar } from "./topbar.view";
import { attachMenuController } from "./menu.controller";
import {
  saveProjectFlow,
  openProjectFlow,
  importMediaFlow,
} from "../../app/flows";
import type { MenuActionId } from "./menu.logic";
import * as actions from "@state/actions";

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
    case "file:save":
      void saveProjectFlow();
      return;
    case "file:open":
      void openProjectFlow();
      return;
    case "file:import":
      void importMediaFlow();
      return;
    case "edit:undo":
      actions.undo();
      return;
    case "edit:redo":
      actions.redo();
      return;
    case "edit:copy":
      actions.copySelection();
      return;
    case "edit:cut":
      actions.cutSelection();
      return;
    case "edit:paste":
      actions.pasteAtPlayhead();
      return;
    case "file:new":
      // TODO(F14): confirm unsaved + actions.newProject()
      // eslint-disable-next-line no-console
      console.info("[topbar] file:new (TODO: F14)");
      return;
    case "file:export":
      // TODO(F14): ffmpeg integration
      // eslint-disable-next-line no-console
      console.info("[topbar] file:export (TODO: F14)");
      return;
    default:
      // eslint-disable-next-line no-console
      console.info(`[topbar] action: ${id} (TODO: wire to feature)`);
  }
}
