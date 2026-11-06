import type { EffectKind } from "@shared/types/timeline";

/* ============================================================
   EFFECT DEFINITIONS
   ------------------------------------------------------------
   Single source of truth untuk semua effect. View (media panel)
   dan logic (preview filter) mengonsumsi dari sini.

   Setiap effect punya param schema (key, min, max, default).
   ============================================================ */

export interface EffectParamDef {
  readonly key: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly defaultValue: number;
}

export interface EffectDef {
  readonly kind: EffectKind;
  readonly name: string;
  readonly sub: string;
  readonly gradientIndex: number;
  readonly params: readonly EffectParamDef[];
}

export const EFFECT_DEFINITIONS: readonly EffectDef[] = [
  {
    kind: "blur",
    name: "Gaussian Blur",
    sub: "Blur & Sharpen",
    gradientIndex: 2,
    params: [
      {
        key: "amount",
        label: "Amount",
        min: 0,
        max: 20,
        step: 0.5,
        defaultValue: 5,
      },
    ],
  },
  {
    kind: "grayscale",
    name: "Grayscale",
    sub: "Color",
    gradientIndex: 4,
    params: [
      {
        key: "amount",
        label: "Amount",
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 100,
      },
    ],
  },
  {
    kind: "sepia",
    name: "Sepia",
    sub: "Color",
    gradientIndex: 5,
    params: [
      {
        key: "amount",
        label: "Amount",
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 100,
      },
    ],
  },
  {
    kind: "brightness",
    name: "Brightness",
    sub: "Exposure",
    gradientIndex: 6,
    params: [
      {
        key: "amount",
        label: "Amount",
        min: 50,
        max: 200,
        step: 1,
        defaultValue: 150,
      },
    ],
  },
  {
    kind: "contrast",
    name: "Contrast",
    sub: "Exposure",
    gradientIndex: 1,
    params: [
      {
        key: "amount",
        label: "Amount",
        min: 50,
        max: 200,
        step: 1,
        defaultValue: 150,
      },
    ],
  },
  {
    kind: "saturate",
    name: "Saturate",
    sub: "Color",
    gradientIndex: 7,
    params: [
      {
        key: "amount",
        label: "Amount",
        min: 0,
        max: 200,
        step: 1,
        defaultValue: 150,
      },
    ],
  },
  {
    kind: "hue-rotate",
    name: "Hue Rotate",
    sub: "Color",
    gradientIndex: 8,
    params: [
      {
        key: "amount",
        label: "Hue",
        min: 0,
        max: 360,
        step: 1,
        defaultValue: 180,
      },
    ],
  },
  {
    kind: "invert",
    name: "Invert",
    sub: "Stylize",
    gradientIndex: 3,
    params: [
      {
        key: "amount",
        label: "Amount",
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 100,
      },
    ],
  },
  {
    kind: "vignette",
    name: "Vignette",
    sub: "Stylize",
    gradientIndex: 4,
    params: [
      {
        key: "amount",
        label: "Strength",
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 60,
      },
    ],
  },
];

export function getEffectDef(kind: EffectKind): EffectDef | undefined {
  return EFFECT_DEFINITIONS.find((e) => e.kind === kind);
}
