import {
  DEFAULT_CLIP_COLOR,
  type Clip,
  type TextClipStyle,
  type ClipAnimation,
} from "@shared/types/timeline";
import type { AppState } from "@shared/types/state";
import { getEffectiveTransform } from "@modules/keyframes/keyframe.logic";
import {
  buildFilterString,
  getVignetteStrength,
} from "@modules/effects/effect.logic";
import { ensureChromaFilter } from "./preview.chroma";
/* ============================================================
   VISUAL TRANSFORM
   ------------------------------------------------------------
   Apply semua properti visual clip ke wrapper `.preview-clip`:
   transform (pos/scale/rot/opacity/crop/feather) + color
   correction + effects + temp overlay + vignette.
   ============================================================ */
export function applyVisualTransform(
  wrapper: HTMLElement,
  clip: Clip,
  localTimeSec: number,
  transitionOpacity: number = 1,
  transitionTranslateX: number = 0,
): void {
  const t = getEffectiveTransform(clip, localTimeSec);
  const c = clip.color ?? DEFAULT_CLIP_COLOR;

  /* ---- Transform (base + transition slide) ---- */
  const xPct = t.positionX / 2 + transitionTranslateX;
  const yPct = t.positionY / 2;

  wrapper.style.transform = `translate(${xPct}%, ${yPct}%) rotate(${t.rotation}deg) scale(${t.scale / 100})`;
  wrapper.style.transformOrigin = "center center";
  wrapper.style.opacity = String((t.opacity / 100) * transitionOpacity);

  /* ---- Crop ---- */
  if (t.cropLeft > 0 || t.cropRight > 0) {
    wrapper.style.clipPath = `inset(0 ${t.cropRight}% 0 ${t.cropLeft}%)`;
  } else {
    wrapper.style.clipPath = "";
  }

  /* ---- Feather ---- */
  if (t.featherEdge && (t.cropLeft > 0 || t.cropRight > 0)) {
    const leftFade = t.cropLeft > 0 ? 3 : 0;
    const rightFade = t.cropRight > 0 ? 3 : 0;
    const mask = `linear-gradient(to right, transparent 0, black ${leftFade}%, black ${100 - rightFade}%, transparent 100%)`;
    wrapper.style.maskImage = mask;
    wrapper.style.setProperty("-webkit-mask-image", mask);
  } else {
    wrapper.style.maskImage = "";
    wrapper.style.setProperty("-webkit-mask-image", "");
  }

  /* ---- Color correction + effects (combined filter) ---- */
  /* ---- Filter chain: chroma key first, then color + effects ---- */
  const filterParts: string[] = [];
  if (clip.chromaKey?.enabled) {
    const id = ensureChromaFilter(clip.id, clip.chromaKey);
    filterParts.push(`url(#${id})`);
  }
  const colorFx = buildFilterString(clip);
  if (colorFx) filterParts.push(colorFx);
  wrapper.style.filter = filterParts.join(" ") || "";

  /* ---- Vignette overlay ---- */
  const vignetteStrength = getVignetteStrength(clip);
  if (vignetteStrength !== null) {
    wrapper.classList.add("has-vignette");
    wrapper.style.setProperty(
      "--vignette-color",
      `rgba(0, 0, 0, ${(vignetteStrength * 0.9).toFixed(2)})`,
    );
  } else {
    wrapper.classList.remove("has-vignette");
    wrapper.style.removeProperty("--vignette-color");
  }

  /* ---- Temperature overlay ---- */
  let overlay = wrapper.querySelector<HTMLElement>(".preview-color-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "preview-color-overlay";
    wrapper.append(overlay);
  }

  if (c.temp !== 0) {
    const alpha = Math.min(0.5, (Math.abs(c.temp) / 100) * 0.5);
    const color =
      c.temp > 0
        ? `rgba(255, 145, 60, ${alpha})`
        : `rgba(60, 145, 255, ${alpha})`;
    overlay.style.background = color;
    overlay.style.display = "block";
  } else {
    overlay.style.display = "none";
  }
}

/* ============================================================
   TEXT CLIP STYLE
   ============================================================ */
export function applyTextClipStyle(
  el: HTMLElement,
  style: TextClipStyle,
): void {
  el.style.fontFamily = style.fontFamily;
  el.style.fontWeight = String(style.fontWeight);
  el.style.fontStyle = style.fontStyle;
  el.style.textDecoration = style.underline ? "underline" : "none";

  /* Defensive base — jangan bergantung CSS class */
  el.style.display = "block";
  el.style.minWidth = "1ch";
  el.style.minHeight = "1em";
  if (!el.style.fontSize || el.style.fontSize === "0px") {
    el.style.fontSize = "24px";
  }

  /* Defensive: base styling inline (tidak bergantung CSS load). */
  el.style.textAlign = "center";
  el.style.lineHeight = "1.25";
  el.style.whiteSpace = "pre-wrap";
  el.style.wordBreak = "break-word";
  el.style.maxWidth = "100%";

  if (style.stroke) {
    el.style.setProperty(
      "-webkit-text-stroke",
      `${style.strokeWidth}px rgba(255, 255, 255, 0.9)`,
    );
    if (style.outlineOnly) {
      el.style.setProperty("-webkit-text-fill-color", "transparent");
      el.style.color = "transparent";
    } else {
      el.style.setProperty("-webkit-text-fill-color", "");
      el.style.color = "#fff";
    }
    el.style.textShadow = "none";
  } else {
    el.style.setProperty("-webkit-text-stroke", "");
    el.style.setProperty("-webkit-text-fill-color", "");
    el.style.color = "#fff";
    el.style.textShadow =
      "0 2px 8px rgba(0,0,0,0.85), 0 1px 2px rgba(0,0,0,0.9)";
  }
}

/**
 * Z-index computation.
 *
 * Track ordering: track 0 (top UI) = highest z.
 * Transition source (fade-out) gets +1 to paint above target (fade-in).
 *
 * Text clips: ALWAYS render on top of all video/image clips,
 * regardless of track position. Text is an overlay — the track
 * position (V1 below V2) is UI-only, not visual z-order.
 */
export function computeZIndex(
  state: AppState,
  trackId: string,
  isSource: boolean,
  isText: boolean = false,
): number {
  /* Text overlay: fixed high z-index, above everything else. */
  if (isText) {
    return 10000 + (isSource ? 1 : 0);
  }

  const tracks = state.project.sequence.tracks;
  const idx = tracks.findIndex((t) => t.id === trackId);
  if (idx < 0) return 1;

  const base = (tracks.length - idx) * 10;
  return isSource ? base + 1 : base;
}

/* ============================================================
   ANIMATION CLASS SYNC
   ============================================================ */
export function syncAnimationClass(
  el: HTMLElement,
  animation: ClipAnimation | null,
): void {
  for (const cls of Array.from(el.classList)) {
    if (cls.startsWith("clip-anim-")) {
      el.classList.remove(cls);
    }
  }
  if (animation) {
    el.classList.add(`clip-anim-${animation.kind}`);
  }
}
