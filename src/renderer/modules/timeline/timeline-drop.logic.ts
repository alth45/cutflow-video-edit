import { makeId } from "@utils/id";
import type { MediaAsset, MediaAssetKind } from "@shared/types/project";
import type { Clip, ClipColorToken, TrackKind } from "@shared/types/timeline";
import { TIMELINE } from "@shared/constants";
import {
  DEFAULT_CLIP_TRANSFORM,
  DEFAULT_CLIP_COLOR,
  DEFAULT_CLIP_AUDIO,
} from "@shared/types/timeline"; /* ============================================================
   DROP LOGIC — pure functions
   ------------------------------------------------------------
   Mapping asset → clip dengan default duration, warna
   deterministik, dan clamping posisi.
   ============================================================ */

export const DEFAULT_CLIP_DURATION_SEC = 5;

export const MIN_CLIP_DURATION_SEC = 0.1;

/**
 * Durasi default clip saat drop:
 * - Video/audio: pakai durasi asli (dari probe), fallback 5s
 * - Image: 5s (tidak ada durasi intrinsik)
 */
export function computeDefaultClipDuration(asset: MediaAsset): number {
  if (asset.durationSec !== null && asset.durationSec > 0) {
    return asset.durationSec;
  }
  return DEFAULT_CLIP_DURATION_SEC;
}

/** Asset kind → track kind yang kompatibel. */
export function compatibleTrackKind(assetKind: MediaAssetKind): TrackKind {
  return assetKind === "audio" ? "audio" : "video";
}

/** Asset kind → clip kind. Image diperlakukan sebagai visual clip (video kind). */
export function assetToClipKind(assetKind: MediaAssetKind): "video" | "audio" {
  return assetKind === "audio" ? "audio" : "video";
}

const CLIP_COLORS: readonly ClipColorToken[] = [
  "purple",
  "blue",
  "orange",
  "teal",
  "pink",
  "green",
  "cyan",
];

/** Warna deterministik dari nama asset — file sama = warna sama. */
export function pickClipColor(name: string): ClipColorToken {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  }
  return CLIP_COLORS[Math.abs(h) % CLIP_COLORS.length]!;
}

/** Konversi mouse X ke detik, clamp ke [0, durationSec]. */
export function clientXToTime(
  clientX: number,
  tlContentRect: DOMRect,
  durationSec: number,
): number {
  if (tlContentRect.width <= 0 || durationSec <= 0) return 0;
  const px = clientX - tlContentRect.left;
  const raw = (px / tlContentRect.width) * durationSec;
  return Math.max(0, Math.min(durationSec, raw));
}

/** Round ke 0.1s terdekat. */
export function roundToTenth(sec: number): number {
  return Math.round(sec * 10) / 10;
}

/** Clamp start position agar clip tidak overflow sequence. */
export function clampStart(
  startSec: number,
  clipDurationSec: number,
  sequenceDurationSec: number,
): number {
  const maxStart = Math.max(0, sequenceDurationSec - clipDurationSec);
  return Math.max(0, Math.min(maxStart, startSec));
}

/**
 * Build clip dari asset + drop position. Durasi default 5s atau
 * sisa sequence, mana yang lebih kecil (minimal 0.1s).
 */
export function buildClipFromAsset(asset: MediaAsset, startSec: number): Clip {
  const kind = assetToClipKind(asset.kind);

  const MAX = TIMELINE.MAX_SEQUENCE_DURATION_SEC;
  const clampedStart = Math.max(
    0,
    Math.min(MAX - MIN_CLIP_DURATION_SEC, startSec),
  );

  const preferred = computeDefaultClipDuration(asset);
  const remaining = MAX - clampedStart;
  const durationSec = Math.max(
    MIN_CLIP_DURATION_SEC,
    Math.min(preferred, remaining),
  );

  const common = {
    id: makeId("clip"),
    name: asset.name,
    startSec: roundToTenth(clampedStart),
    durationSec: roundToTenth(durationSec),
    colorToken: pickClipColor(asset.name),
    transform: DEFAULT_CLIP_TRANSFORM,
    color: DEFAULT_CLIP_COLOR,
    audio: DEFAULT_CLIP_AUDIO,
    effects: [],
    keyframes: {},
    animation: null,
  };

  if (kind === "audio") {
    return {
      ...common,
      kind: "audio",
      source: { kind: "media", mediaId: asset.id },
    };
  }
  return {
    ...common,
    kind: "video",
    source: { kind: "media", mediaId: asset.id },
  };
}
