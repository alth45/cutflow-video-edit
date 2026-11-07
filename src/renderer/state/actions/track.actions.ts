import { appStore } from "@state/appStore";
import { makeId } from "@utils/id";
import type { AppState } from "@shared/types/state";
import type { Track, TrackKind } from "@shared/types/timeline";
import { withProject } from "./helpers";

export function addTrack(kind: TrackKind): void {
  appStore.setState((state) => {
    const tracks = state.project.sequence.tracks;
    const prefix = kind === "video" ? "V" : "A";

    let maxNum = 0;
    for (const t of tracks) {
      if (t.kind !== kind) continue;
      const m = t.name.match(/^[VA](\d+)$/);
      if (m) {
        const n = parseInt(m[1]!, 10);
        if (Number.isFinite(n) && n > maxNum) maxNum = n;
      }
    }

    const newTrack: Track = {
      id: makeId("track"),
      kind,
      name: `${prefix}${maxNum + 1}`,
      clips: [],
      transitions: [],
      muted: false,
      locked: false,
      hidden: false,
    };

    const nextTracks =
      kind === "video" ? [newTrack, ...tracks] : [...tracks, newTrack];

    const nextProject = {
      ...state.project,
      sequence: { ...state.project.sequence, tracks: nextTracks },
    };
    return withProject(state, nextProject);
  });
}

function updateTrackById(
  state: AppState,
  trackId: string,
  updater: (track: Track) => Track,
): AppState {
  if (!state.project.sequence.tracks.some((t) => t.id === trackId))
    return state;
  const next = {
    ...state.project,
    sequence: {
      ...state.project.sequence,
      tracks: state.project.sequence.tracks.map((t) =>
        t.id === trackId ? updater(t) : t,
      ),
    },
  };
  return withProject(state, next);
}

export function toggleTrackHidden(trackId: string): void {
  appStore.setState((s) =>
    updateTrackById(s, trackId, (t) => ({ ...t, hidden: !t.hidden })),
  );
}

export function toggleTrackLocked(trackId: string): void {
  appStore.setState((s) =>
    updateTrackById(s, trackId, (t) => ({ ...t, locked: !t.locked })),
  );
}

export function toggleTrackMuted(trackId: string): void {
  appStore.setState((s) =>
    updateTrackById(s, trackId, (t) => ({ ...t, muted: !t.muted })),
  );
}
