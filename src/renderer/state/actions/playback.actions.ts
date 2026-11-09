import { appStore } from "@state/appStore";

export function togglePlay(): void {
  appStore.setState((state) => {
    if (state.playback.playing) {
      return {
        ...state,
        playback: { ...state.playback, playing: false },
      };
    }
    const duration = state.project.sequence.durationSec;
    const frameSec = 1 / state.project.sequence.fps;
    const atEnd = state.playback.currentTimeSec >= duration - frameSec;
    const startFrom = atEnd ? 0 : state.playback.currentTimeSec;
    return {
      ...state,
      playback: { ...state.playback, playing: true, currentTimeSec: startFrom },
    };
  });
}

export function setPlaying(playing: boolean): void {
  appStore.setState((state) => {
    if (state.playback.playing === playing) return state;
    return { ...state, playback: { ...state.playback, playing } };
  });
}

export function setCurrentTime(sec: number): void {
  appStore.setState((state) => {
    const duration = state.project.sequence.durationSec;
    const clamped = Math.max(0, Math.min(duration, sec));
    if (clamped === state.playback.currentTimeSec) return state;
    return {
      ...state,
      playback: { ...state.playback, currentTimeSec: clamped },
    };
  });
}

export function stepFrame(delta: 1 | -1): void {
  appStore.setState((state) => {
    const frameSec = 1 / state.project.sequence.fps;
    const duration = state.project.sequence.durationSec;
    const next = Math.max(
      0,
      Math.min(duration, state.playback.currentTimeSec + delta * frameSec),
    );
    if (next === state.playback.currentTimeSec) return state;
    return { ...state, playback: { ...state.playback, currentTimeSec: next } };
  });
}

export function goToStart(): void {
  setCurrentTime(0);
}

export function goToEnd(): void {
  appStore.setState((state) => ({
    ...state,
    playback: {
      ...state.playback,
      currentTimeSec: state.project.sequence.durationSec,
    },
  }));
}

/**
 * Toggle master mute (audio playback only — tidak affect export).
 * Video embedded audio + audio clips semua mute/unmute.
 */
export function togglePlaybackMuted(): void {
  appStore.setState((state) => ({
    ...state,
    playback: { ...state.playback, muted: !state.playback.muted },
  }));
}
