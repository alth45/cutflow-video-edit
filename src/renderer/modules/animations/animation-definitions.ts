import type { AnimationKind } from "@shared/types/timeline";

/* ============================================================
   ANIMATION DEFINITIONS
   ------------------------------------------------------------
   Preset CSS keyframe animations. Satu clip = 1 animasi aktif
   (exclusive). Klik = toggle (apply kalau belum, remove kalau
   sudah, replace kalau beda kind).
   ============================================================ */

export interface AnimationDef {
  readonly kind: AnimationKind;
  readonly name: string;
  readonly sub: string;
  readonly gradientIndex: number;
}

export const ANIMATION_DEFINITIONS: readonly AnimationDef[] = [
  { kind: "shake", name: "Shake", sub: "Motion · 0.5s loop", gradientIndex: 1 },
  {
    kind: "glitch",
    name: "Glitch",
    sub: "Distort · 0.6s loop",
    gradientIndex: 8,
  },
  { kind: "pulse", name: "Pulse", sub: "Scale · 1s loop", gradientIndex: 4 },
  { kind: "spin", name: "Spin", sub: "Rotate · 3s loop", gradientIndex: 2 },
  {
    kind: "bounce",
    name: "Bounce",
    sub: "Motion · 0.8s loop",
    gradientIndex: 3,
  },
  { kind: "swing", name: "Swing", sub: "Rotate · 1.2s loop", gradientIndex: 5 },
  {
    kind: "flash",
    name: "Flash",
    sub: "Opacity · 0.5s loop",
    gradientIndex: 6,
  },
  { kind: "wave", name: "Wave", sub: "Motion · 1.5s loop", gradientIndex: 7 },
  { kind: "zoom", name: "Zoom", sub: "Scale · 1s loop", gradientIndex: 5 },
  { kind: "float", name: "Float", sub: "Motion · 2s loop", gradientIndex: 3 },
];

export function getAnimationDef(kind: AnimationKind): AnimationDef | undefined {
  return ANIMATION_DEFINITIONS.find((a) => a.kind === kind);
}
