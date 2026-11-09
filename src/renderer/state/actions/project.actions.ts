import { appStore, createInitialState } from "@state/appStore";
import type { AppState } from "@shared/types/state";
import type { Project } from "@shared/types/project";
import { withProject } from "./helpers";

export function newProject(): void {
  appStore.setState(() => createInitialState());
}

export function loadProject(project: Project): void {
  appStore.setState((state) => ({
    ...state,
    project,
    isDirty: false,
    history: { past: [], future: [] },
    playback: { ...state.playback, playing: false, currentTimeSec: 0 },
    selection: {
      selectedClipIds: [],
      activeTrackId: null,
      selectedTransitionId: null,
    },
  }));
}

export function renameProject(name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  appStore.setState((state) => {
    if (state.project.name === trimmed) return state;
    return withProject(state, { ...state.project, name: trimmed });
  });
}

export function markSaved(updatedAt: number): void {
  appStore.setState((state) => ({
    ...state,
    project: { ...state.project, updatedAt },
    isDirty: false,
  }));
}

/* ---- Undo / Redo ---- */

export function undo(): void {
  appStore.setState((state) => {
    const past = state.history.past;
    if (past.length === 0) return state;
    const previous = past[past.length - 1]!;
    const snapshot = { project: state.project, isDirty: state.isDirty };
    return {
      ...state,
      project: previous.project,
      isDirty: previous.isDirty,
      history: {
        past: past.slice(0, -1),
        future: [snapshot, ...state.history.future],
      },
    };
  });
}

export function redo(): void {
  appStore.setState((state) => {
    const future = state.history.future;
    if (future.length === 0) return state;
    const next = future[0]!;
    const snapshot = { project: state.project, isDirty: state.isDirty };
    return {
      ...state,
      project: next.project,
      isDirty: next.isDirty,
      history: {
        past: [...state.history.past, snapshot],
        future: future.slice(1),
      },
    };
  });
}

export function canUndo(state: AppState): boolean {
  return state.history.past.length > 0;
}

export function canRedo(state: AppState): boolean {
  return state.history.future.length > 0;
}
