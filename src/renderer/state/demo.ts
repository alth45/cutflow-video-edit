import { appStore } from "./appStore";
import { makeId } from "@utils/id";
import type { MediaAsset, MediaAssetKind } from "@shared/types/project";
import type { Clip, ClipColorToken } from "@shared/types/timeline";
import {
  DEFAULT_CLIP_TRANSFORM,
  DEFAULT_CLIP_COLOR,
  DEFAULT_CLIP_AUDIO,
  DEFAULT_TEXT_STYLE, // ← TAMBAH
} from "@shared/types/timeline"; /* ============================================================
   DEMO SEEDING (DEV ONLY)
   ------------------------------------------------------------
   Mengisi state dengan data demo saat dev mode. Idempotent:
   kalau sudah ada data, tidak akan re-seed.
   ============================================================ */

/* ---------- Assets ---------- */

interface DemoAssetDef {
  readonly name: string;
  readonly kind: MediaAssetKind;
  readonly durationSec: number;
  readonly size: number;
}

const DEMO_ASSETS: readonly DemoAssetDef[] = [
  { name: "beach_sunset.mp4", kind: "video", durationSec: 12, size: 5_200_000 },
  { name: "drone_shot.mp4", kind: "video", durationSec: 24, size: 10_400_000 },
  { name: "waves_slowmo.mp4", kind: "video", durationSec: 8, size: 3_200_000 },
  { name: "city_night.mov", kind: "video", durationSec: 31, size: 15_800_000 },
  { name: "title_card.mp4", kind: "video", durationSec: 5, size: 1_800_000 },
  { name: "aerial_pan.mp4", kind: "video", durationSec: 17, size: 7_600_000 },
  { name: "forest_walk.mp4", kind: "video", durationSec: 9, size: 4_100_000 },
  { name: "interview_a.mp4", kind: "video", durationSec: 44, size: 21_500_000 },
  {
    name: "ambient_waves.wav",
    kind: "audio",
    durationSec: 40,
    size: 6_400_000,
  },
  { name: "music_main.mp3", kind: "audio", durationSec: 54, size: 4_300_000 },
];

export function seedDemoMedia(): void {
  appStore.setState((state) => {
    if (state.project.mediaAssets.length > 0) return state;

    const now = Date.now();
    const assets: MediaAsset[] = DEMO_ASSETS.map((def, i) => ({
      id: makeId("media"),
      kind: def.kind,
      path: `/demo/${def.name}`,
      name: def.name,
      size: def.size,
      durationSec: def.durationSec,
      importedAt: now + i,
    }));

    return {
      ...state,
      project: { ...state.project, mediaAssets: assets },
    };
  });
}

/* ---------- Clips ---------- */

interface DemoClipSpec {
  readonly trackName: "V2" | "V1" | "A1" | "A2";
  readonly kind: "video" | "audio" | "text";
  readonly name: string;
  readonly startSec: number;
  readonly durationSec: number;
  readonly colorToken: ClipColorToken;
  readonly mediaName?: string;
  readonly textContent?: string;
}

const DEMO_CLIPS: readonly DemoClipSpec[] = [
  {
    trackName: "V2",
    kind: "text",
    name: "Title Card",
    startSec: 0,
    durationSec: 8.4,
    colorToken: "purple",
    textContent: "CutFlow Demo",
  },
  {
    trackName: "V2",
    kind: "video",
    name: "beach_sunset.mp4",
    startSec: 10.8,
    durationSec: 15.6,
    colorToken: "pink",
    mediaName: "beach_sunset.mp4",
  },
  {
    trackName: "V1",
    kind: "video",
    name: "drone_shot.mp4",
    startSec: 0,
    durationSec: 9.6,
    colorToken: "blue",
    mediaName: "drone_shot.mp4",
  },
  {
    trackName: "V1",
    kind: "video",
    name: "beach_sunset.mp4",
    startSec: 10.2,
    durationSec: 13.2,
    colorToken: "orange",
    mediaName: "beach_sunset.mp4",
  },
  {
    trackName: "V1",
    kind: "video",
    name: "waves_slowmo.mp4",
    startSec: 24,
    durationSec: 18,
    colorToken: "teal",
    mediaName: "waves_slowmo.mp4",
  },
  {
    trackName: "V1",
    kind: "video",
    name: "closing.mp4",
    startSec: 42.9,
    durationSec: 14.4,
    colorToken: "cyan",
    mediaName: "interview_a.mp4",
  },
  {
    trackName: "A1",
    kind: "audio",
    name: "ambient_waves.wav",
    startSec: 0,
    durationSec: 24,
    colorToken: "green",
    mediaName: "ambient_waves.wav",
  },
  {
    trackName: "A1",
    kind: "audio",
    name: "music_main.mp3",
    startSec: 24.6,
    durationSec: 32.4,
    colorToken: "teal",
    mediaName: "music_main.mp3",
  },
  {
    trackName: "A2",
    kind: "audio",
    name: "foley.wav",
    startSec: 3.6,
    durationSec: 18,
    colorToken: "green",
    mediaName: "ambient_waves.wav",
  },
];

export function seedDemoClips(): void {
  appStore.setState((state) => {
    const hasAnyClip = state.project.sequence.tracks.some(
      (t) => t.clips.length > 0,
    );
    if (hasAnyClip) return state;

    const mediaByName = new Map(
      state.project.mediaAssets.map((a) => [a.name, a.id] as const),
    );

    const clipsByTrackName = new Map<string, Clip[]>();
    for (const spec of DEMO_CLIPS) {
      const clip = buildClip(spec, mediaByName);
      if (!clip) continue;
      const list = clipsByTrackName.get(spec.trackName) ?? [];
      list.push(clip);
      clipsByTrackName.set(spec.trackName, list);
    }

    const nextTracks = state.project.sequence.tracks.map((track) => {
      const clips = clipsByTrackName.get(track.name);
      return clips ? { ...track, clips } : track;
    });

    return {
      ...state,
      project: {
        ...state.project,
        sequence: { ...state.project.sequence, tracks: nextTracks },
      },
      isDirty: false,
    };
  });
}

function buildClip(
  spec: DemoClipSpec,
  mediaByName: ReadonlyMap<string, string>,
): Clip | null {
  const common = {
    id: makeId("clip"),
    name: spec.name,
    startSec: spec.startSec,
    durationSec: spec.durationSec,
    colorToken: spec.colorToken,
    transform: DEFAULT_CLIP_TRANSFORM,
    color: DEFAULT_CLIP_COLOR,
    audio: DEFAULT_CLIP_AUDIO,
    effects: [],
    keyframes: {},
    animation: null, 
  };

  switch (spec.kind) {
    case "text":
      return {
        ...common,
        kind: "text",
        source: {
          kind: "text",
          content: spec.textContent ?? spec.name,
          style: DEFAULT_TEXT_STYLE,
        },
      };
    case "video": {
      const mediaId = spec.mediaName
        ? mediaByName.get(spec.mediaName)
        : undefined;
      if (!mediaId) return null;
      return {
        ...common,
        kind: "video",
        source: { kind: "media", mediaId },
      };
    }
    case "audio": {
      const mediaId = spec.mediaName
        ? mediaByName.get(spec.mediaName)
        : undefined;
      if (!mediaId) return null;
      return {
        ...common,
        kind: "audio",
        source: { kind: "media", mediaId },
      };
    }
  }
}
