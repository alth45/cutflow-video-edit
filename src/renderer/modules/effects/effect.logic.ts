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
function effectToFilterString(effect: ClipEffect): string | null {
  const amount = effect.params["amount"] ?? 0;

  switch (effect.kind) {
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
