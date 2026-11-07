/* ============================================================
   INSPECTOR LOGIC — data definitions + pure helpers
   ------------------------------------------------------------
   Data-driven: struktur inspector (tabs → groups → rows) di
   sini, view tinggal iterasi. Nilai slider/switch = **default
   prototype** karena belum ada clip yang di-select (F10).

   F11+: saat clip di-select, view akan re-render dari
   `clip.properties` (future type), dan slider/switch akan bind
   ke sana. Struktur definisi ini akan jadi "schema" default.
   ============================================================ */

import type { InspectorPanelTab } from "@shared/types/state";
import type {
  ClipTransform,
  ClipColor,
  ClipAudio,
  ClipChromaKey,
} from "@shared/types/timeline";
import type { KeyframeableTransformKey } from "@shared/types/timeline";

/* ---------- Formatters ---------- */

export type ValueFormatter = (value: number) => string;

export const fmt = {
  plain: (v: number) => String(v),
  percent: (v: number) => `${v}%`,
  degrees: (v: number) => `${v}°`,
  signed: (v: number) => (v > 0 ? `+${v}` : String(v)),
  db: (v: number) => `${v} dB`,
  /** Pan: -100..100 → L100 / C / R100 */
  pan: (v: number) => (v === 0 ? "C" : v > 0 ? `R${v}` : `L${Math.abs(v)}`),
  /** Fade: internal 0..300 → 0.0s..3.0s */
  seconds: (v: number) => `${(v / 100).toFixed(1)}s`,
  secondsShort: (v: number) => `${v.toFixed(1)}s`,
  /** Exposure: internal -100..100 → -2.5..+2.5 (EV unit) */
  exposure: (v: number) => {
    const ev = v / 40;
    return (ev >= 0 ? "+" : "") + ev.toFixed(1);
  },
} as const satisfies Record<string, ValueFormatter>;

/* ---------- Row types ---------- */

export interface SliderRow {
  readonly kind: "slider";
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly defaultValue: number;
  readonly step?: number;
  readonly format: ValueFormatter;
  readonly transformKey?: keyof ClipTransform;
  readonly colorKey?: keyof ClipColor;
  readonly audioKey?: keyof ClipAudio;
  readonly chromaKey?: "similarity";
  readonly keyframeKey?: KeyframeableTransformKey;
  readonly disabled?: boolean;
}

export interface SwitchRow {
  readonly kind: "switch";
  readonly label: string;
  readonly defaultOn: boolean;
  readonly transformKey?: keyof ClipTransform;
  readonly audioKey?: keyof ClipAudio;
  readonly chromaKey?: "enabled";
  readonly disabled?: boolean;
}

export interface SegmentedRow {
  readonly kind: "segmented";
  readonly label: string;
  readonly options: ReadonlyArray<{
    readonly value: string;
    readonly label: string;
  }>;
  readonly defaultValue: "green" | "blue";
  readonly chromaKey: "keyColor";
}

export interface CurveRow {
  readonly kind: "curve";
}

export type RowDef = SliderRow | SwitchRow | SegmentedRow | CurveRow;

export interface GroupDef {
  /** ID unik global (di-namespace per tab: `video:transform`). */
  readonly id: string;
  readonly label: string;
  readonly rows: readonly RowDef[];
}

export interface TabDef {
  readonly id: InspectorPanelTab;
  readonly label: string;
  readonly groups: readonly GroupDef[];
}

/* ---------- Tabs ---------- */

export const INSPECTOR_TABS: readonly TabDef[] = [
  {
    id: "insp-video",
    label: "Video",
    groups: [
      {
        id: "video:transform",
        label: "Transform",
        rows: [
          {
            kind: "slider",
            label: "Position X",
            min: -100,
            max: 100,
            defaultValue: 0,
            format: fmt.plain,
            transformKey: "positionX",
            keyframeKey: "positionX",
          },
          {
            kind: "slider",
            label: "Position Y",
            min: -100,
            max: 100,
            defaultValue: 0,
            format: fmt.plain,
            transformKey: "positionY",
            keyframeKey: "positionY",
          },
          {
            kind: "slider",
            label: "Scale",
            min: 10,
            max: 200,
            defaultValue: 100,
            format: fmt.percent,
            transformKey: "scale",
            keyframeKey: "scale",
          },
          {
            kind: "slider",
            label: "Rotation",
            min: -180,
            max: 180,
            defaultValue: 0,
            format: fmt.degrees,
            transformKey: "rotation",
            keyframeKey: "rotation",
          },
          {
            kind: "slider",
            label: "Opacity",
            min: 0,
            max: 100,
            defaultValue: 100,
            format: fmt.percent,
            transformKey: "opacity",
            keyframeKey: "opacity",
          },
        ],
      },
      {
        id: "video:crop",
        label: "Crop",
        rows: [
          {
            kind: "slider",
            label: "Left",
            min: 0,
            max: 50,
            defaultValue: 0,
            format: fmt.percent,
            transformKey: "cropLeft",
          },
          {
            kind: "slider",
            label: "Right",
            min: 0,
            max: 50,
            defaultValue: 0,
            format: fmt.percent,
            transformKey: "cropRight",
          },
          {
            kind: "switch",
            label: "Feather Edge",
            defaultOn: false,
            transformKey: "featherEdge",
          },
        ],
      },
      {
        id: "video:speed",
        label: "Speed",
        rows: [
          {
            kind: "slider",
            label: "Rate",
            min: 25,
            max: 400,
            defaultValue: 100,
            format: fmt.percent,
            disabled: true,
          },
          {
            kind: "switch",
            label: "Reverse",
            defaultOn: false,
            disabled: true,
          },
          {
            kind: "switch",
            label: "Optical Flow",
            defaultOn: true,
            disabled: true,
          },
        ],
      },
      {
        id: "video:chroma",
        label: "Chroma Key",
        rows: [
          {
            kind: "switch",
            label: "Enable",
            defaultOn: false,
            chromaKey: "enabled",
          },
          {
            kind: "segmented",
            label: "Color",
            options: [
              { value: "green", label: "Green" },
              { value: "blue", label: "Blue" },
            ],
            defaultValue: "green",
            chromaKey: "keyColor",
          },
          {
            kind: "slider",
            label: "Similarity",
            min: 0,
            max: 100,
            defaultValue: 50,
            format: fmt.plain,
            chromaKey: "similarity",
          },
        ],
      },
    ],
  },
  {
    id: "insp-audio",
    label: "Audio",
    groups: [
      {
        id: "audio:volume",
        label: "Volume",
        rows: [
          {
            kind: "slider",
            label: "Level",
            min: 0,
            max: 100,
            defaultValue: 100,
            format: fmt.percent,
            audioKey: "volume",
          },
          {
            kind: "slider",
            label: "Pan",
            min: -100,
            max: 100,
            defaultValue: 0,
            format: fmt.pan,
            audioKey: "pan",
          },
          {
            kind: "slider",
            label: "Boost",
            min: 0,
            max: 12,
            defaultValue: 0,
            format: fmt.db,
            audioKey: "boostDb",
          },
          {
            kind: "switch",
            label: "Mute clip",
            defaultOn: false,
            audioKey: "muted",
          },
        ],
      },
      {
        id: "audio:fade",
        label: "Fade",
        rows: [
          {
            kind: "slider",
            label: "In",
            min: 0,
            max: 3,
            defaultValue: 0,
            step: 0.1,
            format: fmt.secondsShort,
            audioKey: "fadeInSec",
          },
          {
            kind: "slider",
            label: "Out",
            min: 0,
            max: 3,
            defaultValue: 0,
            step: 0.1,
            format: fmt.secondsShort,
            audioKey: "fadeOutSec",
          },
          {
            kind: "switch",
            label: "Normalize",
            defaultOn: false,
            disabled: true,
          },
        ],
      },
    ],
  },
  {
    id: "insp-color",
    label: "Color",
    groups: [
      {
        id: "color:basic",
        label: "Basic Correction",
        rows: [
          {
            kind: "slider",
            label: "Exposure",
            min: -100,
            max: 100,
            defaultValue: 12,
            format: fmt.exposure,
            colorKey: "exposure",
          },
          {
            kind: "slider",
            label: "Contrast",
            min: -100,
            max: 100,
            defaultValue: 8,
            format: fmt.signed,
            colorKey: "contrast",
          },
          {
            kind: "slider",
            label: "Saturation",
            min: 0,
            max: 200,
            defaultValue: 112,
            format: fmt.plain,
            colorKey: "saturation",
          },
          {
            kind: "slider",
            label: "Temp",
            min: -100,
            max: 100,
            defaultValue: -6,
            format: fmt.signed,
            colorKey: "temp",
          },
        ],
      },
      {
        id: "color:curves",
        label: "Curves",
        rows: [{ kind: "curve" }],
      },
    ],
  },
];

/* ---------- Pure helpers ---------- */

/** Hitung persen fill slider untuk CSS `--val`. */
export function sliderPercent(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  const pct = ((value - min) / (max - min)) * 100;
  return Math.max(0, Math.min(100, pct));
}
