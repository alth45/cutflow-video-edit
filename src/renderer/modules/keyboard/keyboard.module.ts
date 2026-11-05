import { on } from "@core/Dom";
import * as actions from "@state/actions";
import { appStore } from "@state/appStore";
import {
  saveProjectFlow,
  openProjectFlow,
  importMediaFlow,
} from "../../app/flows";
import { SHORTCUTS, type ShortcutAction } from "./keyboard.logic";
import { getClipById } from "@state/selectors";

/* ============================================================
   KEYBOARD MODULE
   ------------------------------------------------------------
   Satu listener `keydown` di document untuk SEMUA shortcut
   global. Skip saat focus di input/textarea/select/contentEditable.
   ============================================================ */

export function mountKeyboard(): () => void {
  const handler = (ev: KeyboardEvent): void => {
    /* Skip saat user mengetik. `isContentEditable` cover
       elemen dengan `contenteditable="true"`. */
    const target = ev.target;
    if (target instanceof HTMLElement) {
      if (
        target.matches("input, textarea, select") ||
        target.isContentEditable
      ) {
        return;
      }
    }

    for (const shortcut of SHORTCUTS) {
      if (!shortcut.match(ev)) continue;

      if (shortcut.preventDefault) ev.preventDefault();
      dispatch(shortcut.action);
      return;
    }
  };

  return on(document, "keydown", handler);
}

function dispatch(action: ShortcutAction): void {
  switch (action.type) {
    case "toggle-play":
      actions.togglePlay();
      return;
    case "step-frame":
      actions.stepFrame(action.delta);
      return;
    case "goto-start":
      actions.goToStart();
      return;
    case "goto-end":
      actions.goToEnd();
      return;
    case "delete-clip": {
      const state = appStore.getState();

      /* Transition selected → remove transition. */
      if (state.selection.selectedTransitionId) {
        actions.removeTransition(state.selection.selectedTransitionId);
        return;
      }

      /* Clip selection → bulk delete. */
      const selected = [...state.selection.selectedClipIds];
      if (selected.length === 0) return;
      actions.deleteClipsBulk(selected);
      return;
    }
    case "undo":
      actions.undo();
      return;
    case "redo":
      actions.redo();
      return;
    case "split-at-playhead": {
      const state = appStore.getState();
      const selectedId = state.selection.selectedClipIds[0];
      if (!selectedId) return;

      const clip = getClipById(state, selectedId);
      if (!clip) return;

      const playhead = state.playback.currentTimeSec;
      if (
        playhead <= clip.startSec ||
        playhead >= clip.startSec + clip.durationSec
      ) {
        return; // playhead di luar clip
      }

      actions.splitClip(selectedId, playhead);
      return;
    }
    case "copy":
      actions.copySelection();
      return;
    case "cut":
      actions.cutSelection();
      return;
    case "paste":
      actions.pasteAtPlayhead();
      return;
    case "placeholder":
      handlePlaceholder(action.id);
      return;
  }
}

function handlePlaceholder(id: string): void {
  switch (id) {
    case "save":
      void saveProjectFlow();
      return;
    case "import":
      void importMediaFlow();
      return;
    case "export":
      // TODO(F14)
      // eslint-disable-next-line no-console
      console.info("[keyboard] export (TODO: F14)");
      return;
    case "open":
      void openProjectFlow();
      return;
      // TODO(F14): undo stack
      // eslint-disable-next-line no-console
      console.info(`[keyboard] ${id} (TODO: F14)`);
      return;
    default:
      // eslint-disable-next-line no-console
      console.info(`[keyboard] ${id} (TODO)`);
  }
}
