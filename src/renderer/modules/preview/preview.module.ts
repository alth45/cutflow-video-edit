import { setChildren } from "@core/Dom";
import { setIconPath } from "@core/icons";
import { appStore } from "@state/appStore";
import type { AppState } from "@shared/types/state";
import { mediaUrl, isDemoPath } from "@utils/media-url";
import { renderPreview, type PreviewView } from "./preview.view";
import { attachPreviewController } from "./preview.controller";
import { createPlaybackTicker } from "./playback.ticker";
import { formatTimecode } from "./playback.logic";
import { getActiveClipsAtTime, type ActiveClipInfo } from "./preview.logic";
import {
  DEFAULT_CLIP_TRANSFORM,
  DEFAULT_CLIP_COLOR,
} from "@shared/types/timeline";

import type { Clip, ClipTransform, ClipColor } from "@shared/types/timeline";
/* ============================================================
   PREVIEW MODULE — ENTRY
   ============================================================ */

export function mountPreview(container: HTMLElement): () => void {
  const initial = appStore.getState();
  const view = renderPreview(initial);
  setChildren(container, view.root);

  const ticker = createPlaybackTicker();
  if (initial.playback.playing) ticker.start();

  /* Composite state — video cache untuk reuse elemen. */
  const videoCache = new Map<string, HTMLVideoElement>();
  const renderedClips = new Map<string, HTMLElement>();

  const unsubscribe = appStore.subscribe((state, prev) => {
    /* Update timecode setiap frame */
    if (state.playback.currentTimeSec !== prev.playback.currentTimeSec) {
      view.tcCurrent.textContent = formatTimecode(
        state.playback.currentTimeSec,
        state.project.sequence.fps,
      );
    }

    /* Play state change → overlay + ticker */
    if (state.playback.playing !== prev.playback.playing) {
      const playing = state.playback.playing;
      view.playOverlay.classList.toggle("hide", playing);
      setIconPath(view.playIconSvg, playing ? "pause" : "play");
      view.btnPlay.setAttribute("aria-label", playing ? "Pause" : "Play");
      if (playing) ticker.start();
      else ticker.stop();
    }

    /* Sequence change → duration/meta (durasi berubah = labels/playhead) */
    if (state.project.sequence !== prev.project.sequence) {
      const seq = state.project.sequence;
      view.tcDuration.textContent = formatTimecode(seq.durationSec, seq.fps);
      view.seqMeta.textContent = `${seq.width} × ${seq.height} · ${seq.fps} fps`;
    }

    /* Composite re-render: setiap perubahan yang affect preview */
    const timeChanged =
      state.playback.currentTimeSec !== prev.playback.currentTimeSec;
    const seqChanged = state.project.sequence !== prev.project.sequence;
    const playStateChanged = state.playback.playing !== prev.playback.playing;

    if (timeChanged || seqChanged || playStateChanged) {
      renderComposite(view, state, videoCache, renderedClips);
    }
  });

  /* Initial composite render (di F5 default state = kosong). */
  renderComposite(view, initial, videoCache, renderedClips);

  const detach = attachPreviewController(view);

  return () => {
    detach();
    unsubscribe();
    ticker.stop();
    /* Cleanup video cache */
    for (const video of videoCache.values()) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    videoCache.clear();
    renderedClips.clear();
    container.replaceChildren();
  };
}

/* ============================================================
   COMPOSITE RENDERER
   ------------------------------------------------------------
   Diff-based: hanya add/remove/update clip visuals yang
   berubah. Video element di-cache per clipId untuk menghindari
   recreate (decode restart).
   ============================================================ */

function renderComposite(
  view: PreviewView,
  state: AppState,
  videoCache: Map<string, HTMLVideoElement>,
  renderedClips: Map<string, HTMLElement>,
): void {
  const composite = view.compositeLayer;
  const timeSec = state.playback.currentTimeSec;
  const playing = state.playback.playing;

  const active = getActiveClipsAtTime(state, timeSec);
  const activeIds = new Set(active.map((a) => a.clip.id));

  /* Remove clips no longer active */
  for (const [clipId, el] of renderedClips) {
    if (!activeIds.has(clipId)) {
      el.remove();
      renderedClips.delete(clipId);

      const video = videoCache.get(clipId);
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
        videoCache.delete(clipId);
      }
    }
  }

  /* Render/update active clips in paint order (bottom → top) */
  /* Render/update active clips (bottom → top paint order) */
  for (const info of active) {
    if (info.visualType === "unsupported") continue;

    let el = renderedClips.get(info.clip.id);

    if (!el) {
      const created = createClipVisual(info, state, videoCache);
      if (!created) continue;
      composite.append(created);
      renderedClips.set(info.clip.id, created);
      el = created;
    }

    updateClipVisual(el, info, playing);
  }
}

/* ============================================================
   CLIP VISUAL FACTORY
   ============================================================ */

function createClipVisual(
  info: ActiveClipInfo,
  state: AppState,
  videoCache: Map<string, HTMLVideoElement>,
): HTMLElement | null {
  const { clip, visualType, localTimeSec } = info;

  const wrapper = document.createElement("div");
  wrapper.className = "preview-clip";
  wrapper.dataset["clipId"] = clip.id;

  switch (visualType) {
    case "text": {
      const textEl = document.createElement("div");
      textEl.className = "preview-text";
      textEl.textContent =
        clip.source.kind === "text" ? clip.source.content : "";
      wrapper.append(textEl);
      applyVisualTransform(wrapper, clip);
      return wrapper;
    }

    case "video": {
      const asset = state.project.mediaAssets.find(
        (a) => clip.source.kind === "media" && a.id === clip.source.mediaId,
      );
      if (!asset) return null;

      /* Demo path → tidak ada file fisik, render placeholder */
      if (isDemoPath(asset.path)) {
        wrapper.append(createPlaceholderVisual(asset.name, "video"));
        applyVisualTransform(wrapper, clip);
        return wrapper;
      }

      const video = document.createElement("video");
      video.src = mediaUrl(asset.path);
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.currentTime = localTimeSec;
      video.addEventListener("error", () => {
        video.remove();
        if (!wrapper.querySelector(".preview-placeholder")) {
          wrapper.append(createPlaceholderVisual(asset.name, "video"));
        }
      });
      wrapper.append(video);
      videoCache.set(clip.id, video);
      return wrapper;
    }

    case "image": {
      const asset = state.project.mediaAssets.find(
        (a) => clip.source.kind === "media" && a.id === clip.source.mediaId,
      );
      if (!asset) return null;

      if (isDemoPath(asset.path)) {
        wrapper.append(createPlaceholderVisual(asset.name, "image"));
        applyVisualTransform(wrapper, clip);
        return wrapper;
      }

      const img = document.createElement("img");
      img.src = mediaUrl(asset.path);
      img.alt = asset.name;
      img.addEventListener("error", () => {
        img.remove();
        if (!wrapper.querySelector(".preview-placeholder")) {
          wrapper.append(createPlaceholderVisual(asset.name, "image"));
        }
      });
      wrapper.append(img);
      return wrapper;
    }

    default:
      return null;
  }
}

function createPlaceholderVisual(
  name: string,
  kind: "video" | "image",
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "preview-placeholder";

  const label = document.createElement("div");
  label.className = "preview-placeholder-label";
  label.textContent = kind === "video" ? `[${name}]` : name;

  const hint = document.createElement("div");
  hint.className = "preview-placeholder-hint";
  hint.textContent = "demo asset — no file";

  wrap.append(label, hint);
  return wrap;
}

/* ============================================================
   CLIP VISUAL UPDATER
   ============================================================ */

function updateClipVisual(
  el: HTMLElement,
  info: ActiveClipInfo,
  playing: boolean,
): void {
  const { clip, visualType, localTimeSec } = info;
  applyVisualTransform(el, clip);
  switch (visualType) {
    case "text": {
      const textEl = el.querySelector<HTMLElement>(".preview-text");
      if (textEl && clip.source.kind === "text") {
        if (textEl.textContent !== clip.source.content) {
          textEl.textContent = clip.source.content;
        }
      }
      return;
    }

    case "video": {
      const video = el.querySelector<HTMLVideoElement>("video");
      if (!video) return;

      if (playing) {
        /* Sedikit drift tolerance — kalau jauh, resync. */
        if (Math.abs(video.currentTime - localTimeSec) > 0.3) {
          video.currentTime = localTimeSec;
        }
        if (video.paused) {
          video.play().catch(() => {
            /* autoplay blocked, ignore */
          });
        }
      } else {
        if (!video.paused) video.pause();
        if (Math.abs(video.currentTime - localTimeSec) > 0.05) {
          video.currentTime = localTimeSec;
        }
      }
      return;
    }

    case "image":
    default:
      return;
  }
}

/* ============================================================
   APPLY CLIP TRANSFORM
   ------------------------------------------------------------
   Terapkan transform (position, scale, rotation, opacity, crop,
   feather) ke wrapper `.preview-clip`. Wrapper full-size, jadi
   transform relatif ke wrapper = relatif ke monitor.
   ============================================================ */

function applyVisualTransform(wrapper: HTMLElement, clip: Clip): void {
  const t = clip.transform ?? DEFAULT_CLIP_TRANSFORM;
  const c = clip.color ?? DEFAULT_CLIP_COLOR;

  /* ---- Transform ---- */
  const xPct = t.positionX / 2;
  const yPct = t.positionY / 2;

  wrapper.style.transform = [
    `translate(${xPct}%, ${yPct}%)`,
    `rotate(${t.rotation}deg)`,
    `scale(${t.scale / 100})`,
  ].join(" ");
  wrapper.style.transformOrigin = "center center";
  wrapper.style.opacity = String(t.opacity / 100);

  if (t.cropLeft > 0 || t.cropRight > 0) {
    wrapper.style.clipPath = `inset(0 ${t.cropRight}% 0 ${t.cropLeft}%)`;
  } else {
    wrapper.style.clipPath = "";
  }

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

  /* ---- Color correction (CSS filter) ---- */
  const filters: string[] = [];
  if (c.exposure !== 0) filters.push(`brightness(${1 + c.exposure / 200})`);
  if (c.contrast !== 0) filters.push(`contrast(${1 + c.contrast / 200})`);
  if (c.saturation !== 100) filters.push(`saturate(${c.saturation / 100})`);
  wrapper.style.filter = filters.join(" ");

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
