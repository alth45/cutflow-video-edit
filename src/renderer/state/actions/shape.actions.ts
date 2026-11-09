import { appStore } from "@state/appStore";
import { TIMELINE } from "@shared/constants";
import { makeId } from "@utils/id";
import {
  DEFAULT_CLIP_TRANSFORM,
  DEFAULT_CLIP_COLOR,
  DEFAULT_CLIP_AUDIO,
  DEFAULT_CHROMA_KEY,
  DEFAULT_SHAPE_STYLE,
} from "@shared/types/timeline";
import type { ShapeClip, ShapeKind } from "@shared/types/timeline";
import { withAutoAdjust } from "./helpers";
import { getShapeLabel } from "@modules/shapes/shape-definitions";

const DEFAULT_SHAPE_DURATION_SEC = 5;

/**
 * Add shape clip at playhead. Track resolution:
 * 1. Active track (kalau video & unlocked)
 * 2. Topmost unlocked video track
 */
export function addShapeClip(shapeType: ShapeKind): void {
  appStore.setState((state) => {
    let targetTrack = state.selection.activeTrackId
      ? state.project.sequence.tracks.find(
          (t) =>
            t.id === state.selection.activeTrackId &&
            t.kind === "video" &&
            !t.locked,
        )
      : undefined;

    if (!targetTrack) {
      targetTrack = state.project.sequence.tracks.find(
        (t) => t.kind === "video" && !t.locked,
      );
    }
    if (!targetTrack) return state;

    const MAX = TIMELINE.MAX_SEQUENCE_DURATION_SEC;
    const playhead = state.playback.currentTimeSec;
    const maxStart = Math.max(0, MAX - DEFAULT_SHAPE_DURATION_SEC);
    const startSec = Math.max(0, Math.min(maxStart, playhead));

    const shapeClip: ShapeClip = {
      id: makeId("clip"),
      kind: "shape",
      name: getShapeLabel(shapeType),
      startSec: Math.round(startSec * 10) / 10,
      durationSec: DEFAULT_SHAPE_DURATION_SEC,
      colorToken: "cyan",
      transform: DEFAULT_CLIP_TRANSFORM,
      color: DEFAULT_CLIP_COLOR,
      audio: DEFAULT_CLIP_AUDIO,
      effects: [],
      keyframes: {},
      animation: null,
      chromaKey: DEFAULT_CHROMA_KEY,
      source: {
        kind: "shape",
        shapeType,
        ...DEFAULT_SHAPE_STYLE,
      },
    };

    const nextProject = {
      ...state.project,
      sequence: {
        ...state.project.sequence,
        tracks: state.project.sequence.tracks.map((t) =>
          t.id === targetTrack!.id
            ? { ...t, clips: [...t.clips, shapeClip] }
            : t,
        ),
      },
    };

    const adjusted = withAutoAdjust(state, nextProject);
    return {
      ...adjusted,
      selection: {
        ...state.selection,
        selectedClipIds: [shapeClip.id],
        selectedTransitionId: null,
      },
      playback: {
        ...adjusted.playback,
        currentTimeSec: shapeClip.startSec + 0.05,
      },
    };
  });
}
