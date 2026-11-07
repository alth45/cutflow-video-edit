import type {
  Clip,
  ClipTransform,
  Keyframe,
  KeyframeMap,
  KeyframeableTransformKey,
} from "@shared/types/timeline";
import { DEFAULT_CLIP_TRANSFORM } from "@shared/types/timeline";

/* ============================================================
   KEYFRAME LOGIC — pure
   ============================================================ */

export const KEYFRAME_MATCH_TOLERANCE_SEC = 0.05;

/** Sort keyframe array by timeSec (immutable). */
export function sortKeyframes(kfs: readonly Keyframe[]): Keyframe[] {
  return [...kfs].sort((a, b) => a.timeSec - b.timeSec);
}

/**
 * Evaluasi nilai property pada waktu tertentu.
 * - Kosong → fallback.
 * - Sebelum kf pertama → kf pertama.
 * - Sesudah kf terakhir → kf terakhir.
 * - Di antara → interpolasi linear.
 */
export function evaluateKeyframeValue(
  keyframes: readonly Keyframe[] | undefined,
  localTimeSec: number,
  fallback: number,
): number {
  if (!keyframes || keyframes.length === 0) return fallback;
  if (keyframes.length === 1) return keyframes[0]!.value;

  const t = localTimeSec;
  const first = keyframes[0]!;
  const last = keyframes[keyframes.length - 1]!;
  if (t <= first.timeSec) return first.value;
  if (t >= last.timeSec) return last.value;

  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i]!;
    const b = keyframes[i + 1]!;
    if (t >= a.timeSec && t < b.timeSec) {
      const span = b.timeSec - a.timeSec;
      if (span <= 0) return b.value;
      const ratio = (t - a.timeSec) / span;
      return a.value + (b.value - a.value) * ratio;
    }
  }
  return last.value;
}

export function findKeyframeAt(
  keyframes: readonly Keyframe[] | undefined,
  localTimeSec: number,
  toleranceSec: number = KEYFRAME_MATCH_TOLERANCE_SEC,
): Keyframe | null {
  if (!keyframes) return null;
  for (const kf of keyframes) {
    if (Math.abs(kf.timeSec - localTimeSec) <= toleranceSec) return kf;
  }
  return null;
}

/** Dapatkan transform efektif (dengan keyframe evaluation) pada waktu tertentu. */
export function getEffectiveTransform(
  clip: Clip,
  localTimeSec: number,
): ClipTransform {
  const base = clip.transform ?? DEFAULT_CLIP_TRANSFORM;
  const kfs: KeyframeMap = clip.keyframes ?? {};

  return {
    ...base,
    positionX: evaluateKeyframeValue(
      kfs.positionX,
      localTimeSec,
      base.positionX,
    ),
    positionY: evaluateKeyframeValue(
      kfs.positionY,
      localTimeSec,
      base.positionY,
    ),
    scale: evaluateKeyframeValue(kfs.scale, localTimeSec, base.scale),
    rotation: evaluateKeyframeValue(kfs.rotation, localTimeSec, base.rotation),
    opacity: evaluateKeyframeValue(kfs.opacity, localTimeSec, base.opacity),
  };
}

/** True kalau property ini punya minimal 1 keyframe. */
export function hasKeyframes(
  clip: Clip,
  key: KeyframeableTransformKey,
): boolean {
  const arr = clip.keyframes?.[key];
  return !!arr && arr.length > 0;
}
