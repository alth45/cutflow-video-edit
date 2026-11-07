import type { AppState } from "@shared/types/state";
import { DEFAULT_CLIP_AUDIO, DEFAULT_TEXT_STYLE } from "@shared/types/timeline";
import {
  getActiveClipsAtTime,
  getTransitionSample,
} from "@modules/preview/preview.logic";
import { getEffectiveTransform } from "@modules/keyframes/keyframe.logic";
import { buildFilterString } from "@modules/effects/effect.logic";
import { getMediaById } from "@state/selectors";
import { mediaUrl } from "@utils/media-url";

/* ============================================================
   FRAME RENDERER — canvas draw per frame
   ------------------------------------------------------------
   Deterministic per-frame draw. Untuk video clip: seek ke
   `localTimeSec` via `waitForSeek` (frame-accurate).

   MVP scope:
   - Transform (pos/scale/rot/opacity/crop)
   - Color correction + effects via `ctx.filter` (CSS filter)
   - Text (default font, stroke support)
   - Transitions (opacity blend)
   - Keyframe animation
   ============================================================ */

export interface MediaCacheEntry {
  element: HTMLVideoElement | HTMLImageElement;
  loaded: boolean;
}

export type MediaCache = Map<string, MediaCacheEntry>;

export async function preloadMedia(
  state: AppState,
  cache: MediaCache,
): Promise<void> {
  const usedAssetIds = new Set<string>();
  for (const track of state.project.sequence.tracks) {
    for (const clip of track.clips) {
      if (clip.source.kind === "media") usedAssetIds.add(clip.source.mediaId);
    }
  }

  const promises: Promise<void>[] = [];

  for (const assetId of usedAssetIds) {
    const asset = getMediaById(state, assetId);
    if (!asset || asset.path.startsWith("/demo/")) continue;
    if (cache.has(assetId)) continue;

    if (asset.kind === "video") {
      const v = document.createElement("video");
      v.src = mediaUrl(asset.path);
      v.crossOrigin = "anonymous";
      v.muted = true;
      v.preload = "auto";
      cache.set(assetId, { element: v, loaded: false });
      promises.push(
        new Promise<void>((r) => {
          v.onloadeddata = () => {
            cache.get(assetId)!.loaded = true;
            r();
          };
          v.onerror = () => r();
        }),
      );
    } else if (asset.kind === "image") {
      const img = new Image();
      img.src = mediaUrl(asset.path);
      img.crossOrigin = "anonymous";
      cache.set(assetId, { element: img, loaded: false });
      promises.push(
        new Promise<void>((r) => {
          img.onload = () => {
            cache.get(assetId)!.loaded = true;
            r();
          };
          img.onerror = () => r();
        }),
      );
    }
  }

  await Promise.all(promises);
}

export async function drawFrame(
  ctx: CanvasRenderingContext2D,
  state: AppState,
  timeSec: number,
  cache: MediaCache,
): Promise<void> {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.filter = "none";
  ctx.globalAlpha = 1;

  const active = getActiveClipsAtTime(state, timeSec);

  for (const info of active) {
    const { clip, localTimeSec } = info;
    const sample = getTransitionSample(state, clip.id, timeSec);
    if (sample.opacity <= 0) continue;

    ctx.save();

    /* Transform */
    const t = getEffectiveTransform(clip, localTimeSec);
    const cx = ctx.canvas.width / 2 + (t.positionX / 200) * ctx.canvas.width;
    const cy = ctx.canvas.height / 2 + (t.positionY / 200) * ctx.canvas.height;
    ctx.translate(cx, cy);
    ctx.rotate((t.rotation * Math.PI) / 180);
    ctx.scale(t.scale / 100, t.scale / 100);
    ctx.globalAlpha = (t.opacity / 100) * sample.opacity;

    /* Filter (color + effects) — CSS filters via ctx.filter */
    const filterStr = buildFilterString(clip);
    ctx.filter = filterStr || "none";

    /* Draw content */
    if (clip.source.kind === "media") {
      const asset = getMediaById(state, clip.source.mediaId);
      if (asset && !asset.path.startsWith("/demo/")) {
        const entry = cache.get(clip.source.mediaId);
        if (entry?.loaded) {
          const media = entry.element;

          /* Seek video ke localTime (frame-accurate). */
          if (media instanceof HTMLVideoElement) {
            await seekVideo(media, localTimeSec);
          }

          const mw =
            media instanceof HTMLVideoElement
              ? media.videoWidth
              : media.naturalWidth;
          const mh =
            media instanceof HTMLVideoElement
              ? media.videoHeight
              : media.naturalHeight;

          if (mw && mh) {
            const mediaRatio = mw / mh;
            const canvasRatio = ctx.canvas.width / ctx.canvas.height;
            let drawW = ctx.canvas.width;
            let drawH = ctx.canvas.height;
            if (mediaRatio > canvasRatio) drawH = ctx.canvas.width / mediaRatio;
            else drawW = ctx.canvas.height * mediaRatio;
            try {
              ctx.drawImage(media, -drawW / 2, -drawH / 2, drawW, drawH);
            } catch {
              /* frame not ready */
            }
          }
        }
      }
    } else if (clip.source.kind === "text") {
      drawText(
        ctx,
        clip.source.content,
        clip.source.style ?? DEFAULT_TEXT_STYLE,
      );
    }

    ctx.restore();
  }
}

function drawText(
  ctx: CanvasRenderingContext2D,
  content: string,
  style:
    | ReturnType<() => typeof DEFAULT_TEXT_STYLE>
    | typeof DEFAULT_TEXT_STYLE,
): void {
  const baseSize = ctx.canvas.height * 0.08;
  ctx.font = `${style.fontWeight === 700 ? "bold" : "normal"} ${style.fontStyle === "italic" ? "italic" : "normal"} ${baseSize}px ${style.fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.85)";
  ctx.shadowBlur = 8;

  const lines = content.split("\n");
  const lineHeight = baseSize * 1.25;
  const totalHeight = lines.length * lineHeight;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const y = -totalHeight / 2 + lineHeight / 2 + i * lineHeight;

    if (style.stroke) {
      ctx.lineWidth = style.strokeWidth * (baseSize / 100) * 2;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.strokeText(line, 0, y);
    }
    if (!style.outlineOnly) {
      ctx.fillStyle = "#fff";
      ctx.fillText(line, 0, y);
    }
  }
}

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  if (Math.abs(video.currentTime - time) < 0.01) return Promise.resolve();
  return new Promise((resolve) => {
    const done = (): void => {
      video.removeEventListener("seeked", done);
      resolve();
    };
    video.addEventListener("seeked", done, { once: true });
    try {
      video.currentTime = Math.max(0, time);
    } catch {
      resolve();
    }
  });
}
