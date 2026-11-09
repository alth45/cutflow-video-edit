import { appStore } from "@state/appStore";
import { TIMELINE } from "@shared/constants";
import type { Sequence } from "@shared/types/project";
import { withProject, computeContentEnd } from "./helpers";

/* ============================================================
   SEQUENCE ACTIONS
   ============================================================ */

export interface SequenceSettingsUpdate {
  readonly name?: string;
  readonly width?: number;
  readonly height?: number;
  readonly fps?: number;
  readonly durationSec?: number;
}

export type SequenceSettingsResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string };

/**
 * Update sequence settings. Validates:
 * - Width / height: 16..7680 / 16..4320 (integers)
 * - FPS: 1..120
 * - Duration: MIN_SEQUENCE..MAX_SEQUENCE, >= content end
 * - Name: non-empty (trimmed)
 *
 * Clamps playhead to new duration if needed.
 * Returns discriminated result for UI error handling.
 */
export function updateSequenceSettings(
  updates: SequenceSettingsUpdate,
): SequenceSettingsResult {
  const state = appStore.getState();
  const seq = state.project.sequence;

  const nextName = (updates.name ?? seq.name).trim();
  const nextWidth = Math.round(updates.width ?? seq.width);
  const nextHeight = Math.round(updates.height ?? seq.height);
  const nextFps = updates.fps ?? seq.fps;
  const nextDuration = updates.durationSec ?? seq.durationSec;

  /* Validate. */
  if (!nextName) return { ok: false, error: "Name cannot be empty" };
  if (nextWidth < 16 || nextWidth > 7680) {
    return { ok: false, error: "Width must be between 16 and 7680" };
  }
  if (nextHeight < 16 || nextHeight > 4320) {
    return { ok: false, error: "Height must be between 16 and 4320" };
  }
  if (!Number.isFinite(nextFps) || nextFps < 1 || nextFps > 120) {
    return { ok: false, error: "Frame rate must be between 1 and 120" };
  }
  if (
    !Number.isFinite(nextDuration) ||
    nextDuration < TIMELINE.MIN_SEQUENCE_DURATION_SEC ||
    nextDuration > TIMELINE.MAX_SEQUENCE_DURATION_SEC
  ) {
    return {
      ok: false,
      error: `Duration must be between ${TIMELINE.MIN_SEQUENCE_DURATION_SEC}s and ${TIMELINE.MAX_SEQUENCE_DURATION_SEC}s`,
    };
  }

  const contentEnd = computeContentEnd(seq.tracks);
  if (nextDuration < contentEnd - 0.01) {
    return {
      ok: false,
      error: `Duration must be at least ${contentEnd.toFixed(1)}s (content length)`,
    };
  }

  /* No-op check. */
  const same =
    nextName === seq.name &&
    nextWidth === seq.width &&
    nextHeight === seq.height &&
    nextFps === seq.fps &&
    Math.abs(nextDuration - seq.durationSec) < 0.01;
  if (same) return { ok: true };

  const nextSequence: Sequence = {
    ...seq,
    name: nextName,
    width: nextWidth,
    height: nextHeight,
    fps: nextFps,
    durationSec: Math.round(nextDuration * 10) / 10,
  };

  /* Apply via updater function (Store requires updater, not object).
     Pakai `prev` dari updater — bukan captured `state` — untuk
     konsistensi kalau ada update lain di antara getState() dan setState(). */
  appStore.setState((prev) => {
    const nextProject = { ...prev.project, sequence: nextSequence };
    const clampedTime = Math.min(
      prev.playback.currentTimeSec,
      nextSequence.durationSec,
    );
    const playback =
      clampedTime !== prev.playback.currentTimeSec
        ? { ...prev.playback, currentTimeSec: clampedTime }
        : prev.playback;

    const next = withProject(prev, nextProject);
    return playback !== prev.playback ? { ...next, playback } : next;
  });

  return { ok: true };
}
