import { makeId } from "@utils/id";
import type { ClipEffect, EffectKind } from "@shared/types/timeline";
import { DEFAULT_CLIP_COLOR } from "@shared/types/timeline";
import { getEffectDef } from "./effect-definitions";

/* ============================================================
   EFFECT LOGIC — pure helpers
   ============================================================ */

/** Buat ClipEffect baru dengan default params dari definition. */
export function createDefaultEffect(kind: EffectKind): ClipEffect | null {
  const def = getEffectDef(kind);
  if (!def) return null;

  const params: Record<string, number> = {};
  for (const p of def.params) params[p.key] = p.defaultValue;

  return {
    id: makeId("effect"),
    kind,
    params,
    enabled: true,
  };
}

/** Map 1 effect ke CSS filter string (null untuk vignette — handled via overlay). */
/**
 * Convert one effect to CSS filter string.
 * Return null untuk efek yang di-handle via overlay (vignette).
 *
 * Preset effects (`amount` 0-100) → t = amount/100 normalized,
 * scale intensitas tiap sub-filter secara linear.
 */
function effectToFilterString(effect: ClipEffect): string | null {
  const amount = effect.params["amount"] ?? 0;
  const t = amount / 100; // 0..1 (normalized intensity untuk preset)

  switch (effect.kind) {
    /* ---- Filter primitives ---- */
    case "blur":
      return `blur(${amount}px)`;
    case "grayscale":
      return `grayscale(${amount}%)`;
    case "sepia":
      return `sepia(${amount}%)`;
    case "brightness":
      return `brightness(${(amount / 100).toFixed(3)})`;
    case "contrast":
      return `contrast(${(amount / 100).toFixed(3)})`;
    case "saturate":
      return `saturate(${(amount / 100).toFixed(3)})`;
    case "hue-rotate":
      return `hue-rotate(${amount}deg)`;
    case "invert":
      return `invert(${amount}%)`;

    /* ---- New primitives ---- */
    case "drop-shadow": {
      const blur = 4 + t * 16; // 4..20px
      const offsetY = 4 + t * 4; // 4..8px
      const alpha = 0.3 + t * 0.6; // 0.3..0.9
      return `drop-shadow(0 ${offsetY.toFixed(1)}px ${blur.toFixed(1)}px rgba(0,0,0,${alpha.toFixed(2)}))`;
    }

    /* ---- Detail / stylize (F14ap) ---- */
    case "sharpen": {
      /* Approximation: contrast + slight saturate boost.
         True sharpen needs SVG convolve kernel (future). */
      const contrast = 1 + t * 0.4; // 1.0..1.4
      const saturate = 1 + t * 0.15; // 1.0..1.15
      return `contrast(${contrast.toFixed(3)}) saturate(${saturate.toFixed(3)})`;
    }

    case "glow": {
      /* Soft stacked halo. 2-layer drop-shadow for smooth falloff. */
      const blur1 = 3 + t * 10; // 3..13px
      const blur2 = 8 + t * 20; // 8..28px
      const alpha = 0.4 + t * 0.5; // 0.4..0.9
      const a2 = alpha * 0.5;
      return `drop-shadow(0 0 ${blur1.toFixed(1)}px rgba(255,220,150,${alpha.toFixed(2)})) drop-shadow(0 0 ${blur2.toFixed(1)}px rgba(255,220,150,${a2.toFixed(2)}))`;
    }

    case "hdr": {
      /* Punchy local-contrast simulation: high contrast + saturated. */
      const contrast = 1 + t * 0.35;
      const saturate = 1 + t * 0.4;
      const brightness = 1 + t * 0.05;
      return `contrast(${contrast.toFixed(3)}) saturate(${saturate.toFixed(3)}) brightness(${brightness.toFixed(3)})`;
    }

    case "tonal-contrast": {
      /* Midtone contrast: darken slightly + boost contrast. */
      const contrast = 1 + t * 0.25;
      const brightness = 1 - t * 0.08;
      return `contrast(${contrast.toFixed(3)}) brightness(${brightness.toFixed(3)})`;
    }
    /* ---- Presets (combinations) ---- */
    case "vintage": {
      /* Classic faded-photo look: muted + warm. */
      const sepia = 20 + t * 30; // 20..50%
      const contrast = 1 + t * 0.15; // 1.0..1.15
      const brightness = 1 - t * 0.05; // 1.0..0.95
      return `sepia(${sepia.toFixed(0)}%) contrast(${contrast.toFixed(3)}) brightness(${brightness.toFixed(3)})`;
    }

    case "cinematic": {
      /* High contrast + saturated + slight warm. */
      const contrast = 1 + t * 0.25; // 1.0..1.25
      const saturate = 1 + t * 0.2; // 1.0..1.2
      const hue = t * 5; // 0..5deg
      return `contrast(${contrast.toFixed(3)}) saturate(${saturate.toFixed(3)}) hue-rotate(${hue.toFixed(1)}deg)`;
    }

    case "dreamy": {
      /* Soft glow: bright + saturated + slight blur. */
      const brightness = 1 + t * 0.1;
      const saturate = 1 + t * 0.15;
      const blur = t * 2; // 0..2px
      return `brightness(${brightness.toFixed(3)}) saturate(${saturate.toFixed(3)}) blur(${blur.toFixed(1)}px)`;
    }

    case "noir": {
      /* B&W cinema: full grayscale + high contrast + slightly dark. */
      const contrast = 1 + t * 0.4;
      const brightness = 1 - t * 0.1;
      return `grayscale(100%) contrast(${contrast.toFixed(3)}) brightness(${brightness.toFixed(3)})`;
    }

    case "punch": {
      /* Aggressive: high contrast + high saturate. */
      const contrast = 1 + t * 0.4;
      const saturate = 1 + t * 0.5;
      return `contrast(${contrast.toFixed(3)}) saturate(${saturate.toFixed(3)})`;
    }

    case "faded": {
      /* Muted film: low contrast + desaturated + brighter. */
      const contrast = 1 - t * 0.2;
      const saturate = 1 - t * 0.3;
      const brightness = 1 + t * 0.1;
      return `contrast(${contrast.toFixed(3)}) saturate(${saturate.toFixed(3)}) brightness(${brightness.toFixed(3)})`;
    }

    case "warm": {
      /* Warm sunset tint: positive hue + saturated. */
      const hue = t * 20; // 0..20deg toward orange/red
      const saturate = 1 + t * 0.2;
      return `hue-rotate(${hue.toFixed(1)}deg) saturate(${saturate.toFixed(3)})`;
    }

    case "cool": {
      /* Cool blue tint: negative hue + slight saturate. */
      const hue = -t * 20; // 0..-20deg toward blue
      const saturate = 1 + t * 0.15;
      return `hue-rotate(${hue.toFixed(1)}deg) saturate(${saturate.toFixed(3)})`;
    }

    /* ---- Overlay (handled elsewhere) ---- */
    case "vignette":
      return null;
  }
}

/**
 * Bangun CSS `filter` string dari color correction + semua
 * effects yang enabled. Urutan: color first, lalu effects.
 */
export function buildFilterString(clip: {
  color?: {
    exposure: number;
    contrast: number;
    saturation: number;
    temp: number;
  };
  effects?: readonly ClipEffect[];
}): string {
  const filters: string[] = [];

  const c = clip.color ?? DEFAULT_CLIP_COLOR;
  if (c.exposure !== 0)
    filters.push(`brightness(${(1 + c.exposure / 200).toFixed(3)})`);
  if (c.contrast !== 0)
    filters.push(`contrast(${(1 + c.contrast / 200).toFixed(3)})`);
  if (c.saturation !== 100)
    filters.push(`saturate(${(c.saturation / 100).toFixed(3)})`);

  for (const effect of clip.effects ?? []) {
    if (!effect.enabled) continue;
    const f = effectToFilterString(effect);
    if (f) filters.push(f);
  }

  return filters.join(" ");
}

/** Kekuatan vignette (0..1) atau null kalau tidak ada. */
export function getVignetteStrength(clip: {
  effects?: readonly ClipEffect[];
}): number | null {
  const vignette = (clip.effects ?? []).find(
    (e) => e.enabled && e.kind === "vignette",
  );
  if (!vignette) return null;
  return Math.max(0, Math.min(1, (vignette.params["amount"] ?? 60) / 100));
}
