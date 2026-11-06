import { Store } from "@core/Store";
import { PLAYBACK, ZOOM } from "@shared/constants";
import { makeId } from "@utils/id";
import { PROJECT_SCHEMA_VERSION } from "@shared/types/project";
import type { Project, Sequence } from "@shared/types/project";
import type { Track } from "@shared/types/timeline";
import type { AppState } from "@shared/types/state";

/* ============================================================
   APP STORE
   ------------------------------------------------------------
   Instance tunggal `Store<AppState>` untuk seluruh renderer.
   ============================================================ */

function createTrack(kind: "video" | "audio", name: string): Track {
  return {
    id: makeId("track"),
    kind,
    name,
    clips: [],
    transitions: [],
    muted: false,
    locked: false,
    hidden: false,
  };
}

function createDefaultSequence(): Sequence {
  return {
    id: makeId("seq"),
    name: "Sequence 01",
    width: 1920,
    height: 1080,
    fps: PLAYBACK.FPS,
    durationSec: PLAYBACK.DURATION_SEC,
    tracks: [
      createTrack("video", "V2"),
      createTrack("video", "V1"),
      createTrack("audio", "A1"),
      createTrack("audio", "A2"),
    ],
  };
}

export function createDefaultProject(): Project {
  const now = Date.now();
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: makeId("project"),
    name: "Untitled Project",
    createdAt: now,
    updatedAt: now,
    sequence: createDefaultSequence(),
    mediaAssets: [],
  };
}

export function createInitialState(): AppState {
  const project = createDefaultProject();

  return {
    project,
    isDirty: false,
    history: { past: [], future: [] },
    selection: {
      selectedClipIds: [],
      selectedTransitionId: null,
      activeTrackId: null,
    },
    playback: {
      playing: false,
      currentTimeSec: 0,
    },
    ui: {
      media: {
        activeTab: "media-bin",
        searchQuery: "",
        selectedAssetIds: [], 
      },
      inspector: {
        activeTab: "insp-video",
        collapsedGroups: [],
      },
      timeline: {
        zoom: ZOOM.DEFAULT,
        snapEnabled: true,
        activeTool: "pointer",
      },
      layout: {
        // ← TAMBAH
        mediaHidden: false,
        inspectorHidden: false,
        timelineHidden: false,
        previewFullscreen: false,
      },
    },
  };
}

export const appStore = new Store<AppState>(createInitialState());
