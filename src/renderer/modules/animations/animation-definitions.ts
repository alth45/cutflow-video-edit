import type { AnimationKind, AnimationCategory } from "@shared/types/timeline";

/* ============================================================
   ANIMATION DEFINITIONS
   ------------------------------------------------------------
   Preset CSS keyframe animations. Satu clip = 1 animasi aktif
   (exclusive). Klik = toggle, beda kind = replace.

   `category`:
   - 'general' → tersedia untuk semua clip kind (video/image/text)
   - 'text'    → hanya untuk text clip (panel filter otomatis)
   ============================================================ */

export interface AnimationDef {
  readonly kind: AnimationKind;
  readonly name: string;
  readonly sub: string;
  readonly gradientIndex: number;
  readonly category: AnimationCategory;
}

export const ANIMATION_DEFINITIONS: readonly AnimationDef[] = [
  /* ---- General (F14af originals) ---- */
  {
    kind: "shake",
    name: "Shake",
    sub: "Motion · 0.5s",
    gradientIndex: 1,
    category: "general",
  },
  {
    kind: "glitch",
    name: "Glitch",
    sub: "Distort · 0.6s",
    gradientIndex: 8,
    category: "general",
  },
  {
    kind: "pulse",
    name: "Pulse",
    sub: "Scale · 1s",
    gradientIndex: 4,
    category: "general",
  },
  {
    kind: "spin",
    name: "Spin",
    sub: "Rotate · 3s",
    gradientIndex: 2,
    category: "general",
  },
  {
    kind: "bounce",
    name: "Bounce",
    sub: "Motion · 0.8s",
    gradientIndex: 3,
    category: "general",
  },
  {
    kind: "swing",
    name: "Swing",
    sub: "Rotate · 1.2s",
    gradientIndex: 5,
    category: "general",
  },
  {
    kind: "flash",
    name: "Flash",
    sub: "Opacity · 0.5s",
    gradientIndex: 6,
    category: "general",
  },
  {
    kind: "wave",
    name: "Wave",
    sub: "Motion · 1.5s",
    gradientIndex: 7,
    category: "general",
  },
  {
    kind: "zoom",
    name: "Zoom",
    sub: "Scale · 1s",
    gradientIndex: 5,
    category: "general",
  },
  {
    kind: "float",
    name: "Float",
    sub: "Motion · 2s",
    gradientIndex: 3,
    category: "general",
  },

  /* ---- General (F14ai new) ---- */
  {
    kind: "blur-in",
    name: "Blur In",
    sub: "Focus · 2s",
    gradientIndex: 2,
    category: "general",
  },
  {
    kind: "slide-in",
    name: "Slide In",
    sub: "Motion · 2s",
    gradientIndex: 1,
    category: "general",
  },
  {
    kind: "flicker",
    name: "Flicker",
    sub: "Neon · 3s",
    gradientIndex: 6,
    category: "general",
  },
  {
    kind: "wobble",
    name: "Wobble",
    sub: "Motion · 1.2s",
    gradientIndex: 8,
    category: "general",
  },
  {
    kind: "heartbeat",
    name: "Heartbeat",
    sub: "Scale · 1.5s",
    gradientIndex: 4,
    category: "general",
  },
  {
    kind: "glow",
    name: "Glow",
    sub: "Filter · 2s",
    gradientIndex: 5,
    category: "general",
  },
  {
    kind: "rainbow",
    name: "Rainbow",
    sub: "Hue · 4s",
    gradientIndex: 3,
    category: "general",
  },
  {
    kind: "tilt",
    name: "Tilt",
    sub: "Motion · 2s",
    gradientIndex: 7,
    category: "general",
  },

  /* ---- Text-specific (F14ai new) ---- */
  {
    kind: "typewriter",
    name: "Typewriter",
    sub: "Text · 3s loop",
    gradientIndex: 1,
    category: "text",
  },
  {
    kind: "neon-text",
    name: "Neon Text",
    sub: "Text · glow",
    gradientIndex: 4,
    category: "text",
  },
];

export function getAnimationDef(kind: AnimationKind): AnimationDef | undefined {
  return ANIMATION_DEFINITIONS.find((a) => a.kind === kind);
}
