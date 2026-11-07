import { appStore } from "@state/appStore";
import { TIMELINE } from "@shared/constants";
import { makeId } from "@utils/id";
import { getTrackById } from "@state/selectors";
import {
  DEFAULT_CLIP_TRANSFORM,
  DEFAULT_CLIP_COLOR,
  DEFAULT_CLIP_AUDIO,
  DEFAULT_TEXT_STYLE,
} from "@shared/types/timeline";
import type { TextClip, TextClipStyle } from "@shared/types/timeline";
import { withAutoAdjust, withProject } from "./helpers";
import { DEFAULT_CHROMA_KEY } from "@shared/types/timeline";

const DEFAULT_TEXT_CLIP_DURATION_SEC = 5;

export function addTextClip(trackId: string, startSec: number): void {
  appStore.setState((state) => {
    const track = getTrackById(state, trackId);
    if (!track || track.locked) return state;
    if (track.kind !== "video") return state;

    const MAX = TIMELINE.MAX_SEQUENCE_DURATION_SEC;
    const duration = DEFAULT_TEXT_CLIP_DURATION_SEC;
    const maxStart = Math.max(0, MAX - duration);
    const clampedStart = Math.max(0, Math.min(maxStart, startSec));

    const textClip: TextClip = {
      id: makeId("clip"),
      kind: "text",
      name: "Text",
      startSec: Math.round(clampedStart * 10) / 10,
      durationSec: duration,
      colorToken: "purple",
      transform: DEFAULT_CLIP_TRANSFORM,
      color: DEFAULT_CLIP_COLOR,
      audio: DEFAULT_CLIP_AUDIO,
      effects: [],
      keyframes: {},
      animation: null,
      chromaKey: DEFAULT_CHROMA_KEY,
      source: { kind: "text", content: "Text", style: DEFAULT_TEXT_STYLE },
    };

    const nextTrack = { ...track, clips: [...track.clips, textClip] };
    const nextProject = {
      ...state.project,
      sequence: {
        ...state.project.sequence,
        tracks: state.project.sequence.tracks.map((t) =>
          t.id === trackId ? nextTrack : t,
        ),
      },
    };

    /* FIX: pakai withAutoAdjust (sebelumnya withAutoExtend yang sudah
       tidak ada → crash saat create text clip). */
    const adjusted = withAutoAdjust(state, nextProject);
    return {
      ...adjusted,
      selection: {
        ...state.selection,
        selectedClipIds: [textClip.id],
        selectedTransitionId: null,
      },
      playback: {
        ...adjusted.playback,
        currentTimeSec: textClip.startSec + 0.05,
      },
    };
  });
}

export function updateTextClip(
  clipId: string,
  content: string,
  style: TextClipStyle,
): void {
  const trimmed = content.trim();
  if (!trimmed) return;

  appStore.setState((state) => {
    for (const track of state.project.sequence.tracks) {
      if (track.locked) continue;
      const idx = track.clips.findIndex((c) => c.id === clipId);
      if (idx < 0) continue;
      const clip = track.clips[idx];
      if (!clip || clip.kind !== "text") return state;

      const prevStyle = clip.source.style ?? DEFAULT_TEXT_STYLE;
      const styleChanged = JSON.stringify(prevStyle) !== JSON.stringify(style);
      const contentChanged = clip.source.content !== trimmed;
      if (!contentChanged && !styleChanged) return state;

      const displayName = trimmed.replace(/\s+/g, " ").slice(0, 80) || "Text";
      const nextClip: TextClip = {
        ...clip,
        name: displayName,
        source: { kind: "text", content: trimmed, style },
      };

      const nextClips = [...track.clips];
      nextClips[idx] = nextClip;
      const nextProject = {
        ...state.project,
        sequence: {
          ...state.project.sequence,
          tracks: state.project.sequence.tracks.map((t) =>
            t.id === track.id ? { ...t, clips: nextClips } : t,
          ),
        },
      };
      return withProject(state, nextProject);
    }
    return state;
  });
}
