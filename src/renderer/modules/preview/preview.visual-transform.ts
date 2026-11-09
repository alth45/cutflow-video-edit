import {
  DEFAULT_CLIP_COLOR,
  type Clip,
  type ClipTransform,
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
import type { TransitionSample } from "./preview.logic";
import { curveFilterPart } from "./preview.curve";

/* ============================================================
   VISUAL TRANSFORM
   ------------------------------------------------------------
   Apply semua properti visual clip ke wrapper `.preview-clip`.
   Composed dari 5 concern terpisah (lihat helper di bawah):
   - Transform (pos/scale/rot/opacity + transition deltas)
   - Clip-path + feather (crop)
   - Filter chain (transition blur → chroma → color → curve)
   - Vignette overlay
   - Temperature tint overlay
   ============================================================ */
export function applyVisualTransform(
  wrapper: HTMLElement,
  clip: Clip,
  localTimeSec: number,
  sample: TransitionSample,
): void {
  const t = getEffectiveTransform(clip, localTimeSec);
  const temp = (clip.color ?? DEFAULT_CLIP_COLOR).temp;

  applyTransform(wrapper, t, sample);
  applyClipPath(wrapper, t, sample);
  applyFilter(wrapper, clip, sample);
  applyVignette(wrapper, clip);
  applyTempOverlay(wrapper, temp);
}

/* ---- 1. Transform ---- */
function applyTransform(
  wrapper: HTMLElement,
  t: ClipTransform,
  sample: TransitionSample,
): void {
  const xPct = t.positionX / 2 + (sample.translateX ?? 0);
  const yPct = t.positionY / 2 + (sample.translateY ?? 0);
  const scaleMul = sample.scale ?? 1;

  wrapper.style.transform = [
    `translate(${xPct}%, ${yPct}%)`,
    `rotate(${t.rotation}deg)`,
    `scale(${(t.scale / 100) * scaleMul})`,
  ].join(" ");
  wrapper.style.transformOrigin = "center center";
  wrapper.style.opacity = String((t.opacity / 100) * sample.opacity);
}

/* ---- 2. Clip-path + feather ---- */
function applyClipPath(
  wrapper: HTMLElement,
  t: ClipTransform,
  sample: TransitionSample,
): void {
  const baseClipPath =
    t.cropLeft > 0 || t.cropRight > 0
      ? `inset(0 ${t.cropRight}% 0 ${t.cropLeft}%)`
      : "";
  wrapper.style.clipPath = sample.clipPath ?? baseClipPath;

  const useFeather =
    t.featherEdge && (t.cropLeft > 0 || t.cropRight > 0) && !sample.clipPath;

  if (useFeather) {
    const leftFade = t.cropLeft > 0 ? 3 : 0;
    const rightFade = t.cropRight > 0 ? 3 : 0;
    const mask = `linear-gradient(to right, transparent 0, black ${leftFade}%, black ${100 - rightFade}%, transparent 100%)`;
    wrapper.style.maskImage = mask;
    wrapper.style.setProperty("-webkit-mask-image", mask);
  } else {
    wrapper.style.maskImage = "";
    wrapper.style.setProperty("-webkit-mask-image", "");
  }
}

/* ---- 3. Filter chain ---- */
function applyFilter(
  wrapper: HTMLElement,
  clip: Clip,
  sample: TransitionSample,
): void {
  const parts: string[] = [];

  /* Transition blur first (before color grading). */
  if (sample.blurPx && sample.blurPx > 0) {
    parts.push(`blur(${sample.blurPx.toFixed(1)}px)`);
  }

  /* Chroma key (green screen removal). */
  if (clip.chromaKey?.enabled) {
    const id = ensureChromaFilter(clip.id, clip.chromaKey);
    parts.push(`url(#${id})`);
  }

  /* Color correction + effects. */
  const colorFx = buildFilterString(clip);
  if (colorFx) parts.push(colorFx);

  /* Color curve (identity curve auto-skipped). */
  const curveFx = curveFilterPart(clip.id, clip.color?.curve);
  if (curveFx) parts.push(curveFx);

  wrapper.style.filter = parts.join(" ") || "";
}

/* ---- 4. Vignette ---- */
function applyVignette(wrapper: HTMLElement, clip: Clip): void {
  const strength = getVignetteStrength(clip);
  if (strength !== null) {
    wrapper.classList.add("has-vignette");
    wrapper.style.setProperty(
      "--vignette-color",
      `rgba(0, 0, 0, ${(strength * 0.9).toFixed(2)})`,
    );
  } else {
    wrapper.classList.remove("has-vignette");
    wrapper.style.removeProperty("--vignette-color");
  }
}

/* ---- 5. Temperature tint overlay ---- */
function applyTempOverlay(wrapper: HTMLElement, temp: number): void {
  let overlay = wrapper.querySelector<HTMLElement>(".preview-color-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "preview-color-overlay";
    wrapper.append(overlay);
  }

  if (temp !== 0) {
    const alpha = Math.min(0.5, (Math.abs(temp) / 100) * 0.5);
    overlay.style.background =
      temp > 0
        ? `rgba(255, 145, 60, ${alpha})`
        : `rgba(60, 145, 255, ${alpha})`;
    overlay.style.display = "block";
  } else {
    overlay.style.display = "none";
  }
}

/* ============================================================
   TEXT CLIP STYLE
   ------------------------------------------------------------
   Defensive inline styles (tidak bergantung CSS load). Jika
   CSS `.preview-text` gagal dimuat, text tetap visible.
   ============================================================ */
export function applyTextClipStyle(
  el: HTMLElement,
  style: TextClipStyle,
): void {
  el.style.fontFamily = style.fontFamily;
  el.style.fontWeight = String(style.fontWeight);
  el.style.fontStyle = style.fontStyle;
  el.style.textDecoration = style.underline ? "underline" : "none";

  /* Base sizing (CSS fallback). */
  el.style.display = "block";
  el.style.minWidth = "1ch";
  el.style.minHeight = "1em";
  if (!el.style.fontSize || el.style.fontSize === "0px") {
    el.style.fontSize = "24px";
  }

  /* Text layout (CSS fallback). */
  el.style.textAlign = "center";
  el.style.lineHeight = "1.25";
  el.style.whiteSpace = "pre-wrap";
  el.style.wordBreak = "break-word";
  el.style.maxWidth = "100%";

  /* Stroke / fill variant. */
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

/* ============================================================
   Z-INDEX COMPUTATION
   ------------------------------------------------------------
   Track 0 (top UI) = highest z.
   Transition source (fade-out) gets +1 to paint above target.

   Text clips: ALWAYS on top of all video/image/shape clips,
   regardless of track position. Text = overlay, track position
   is UI-only.
   ============================================================ */
export function computeZIndex(
  state: AppState,
  trackId: string,
  isSource: boolean,
  isText: boolean = false,
): number {
  if (isText) return 10000 + (isSource ? 1 : 0);

  const tracks = state.project.sequence.tracks;
  const idx = tracks.findIndex((t) => t.id === trackId);
  if (idx < 0) return 1;

  const base = (tracks.length - idx) * 10;
  return isSource ? base + 1 : base;
}

/* ============================================================
   ANIMATION CLASS SYNC
   ------------------------------------------------------------
   Exclusive: only one `clip-anim-*` class at a time. Remove all,
   then add current (if any).
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
