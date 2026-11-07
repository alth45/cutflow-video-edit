import type { AppState } from "@shared/types/state";
import { DEFAULT_CLIP_AUDIO, DEFAULT_TEXT_STYLE } from "@shared/types/timeline";
import { mediaUrl, isDemoPath } from "@utils/media-url";
import {
  getTransitionSample,
  computeClipVolume,
  type ActiveClipInfo,
} from "./preview.logic";
import type { AudioEngine } from "./audio-engine";
import {
  applyVisualTransform,
  applyTextClipStyle,
  computeZIndex,
  syncAnimationClass,
} from "./preview.visual-transform";

/* ============================================================
   CREATE CLIP VISUAL
   ============================================================ */
export function createClipVisual(
  info: ActiveClipInfo,
  state: AppState,
  videoCache: Map<string, HTMLVideoElement>,
  audioEngine: AudioEngine,
): HTMLElement | null {
  const { clip, visualType, localTimeSec } = info;

  const wrapper = document.createElement("div");
  wrapper.className = "preview-clip";
  wrapper.dataset["clipId"] = clip.id;

  const content = document.createElement("div");
  content.className = "preview-clip-content";
  if (clip.animation) {
    content.classList.add(`clip-anim-${clip.animation.kind}`);
  }

  const sample = getTransitionSample(
    state,
    clip.id,
    state.playback.currentTimeSec,
  );

  switch (visualType) {
    case "text": {
      wrapper.classList.add("text");
      const textEl = document.createElement("div");
      textEl.className = "preview-text";
      textEl.textContent =
        clip.source.kind === "text" ? clip.source.content : "";
      if (clip.source.kind === "text") {
        applyTextClipStyle(textEl, clip.source.style ?? DEFAULT_TEXT_STYLE);
      }
      content.append(textEl);
      wrapper.append(content);
      applyVisualTransform(wrapper, clip, localTimeSec, sample);
      wrapper.style.zIndex = String(
        computeZIndex(
          state,
          info.track.id,
          sample.zAbove ?? sample.layer === "source",
        ),
      );
      return wrapper;
    }

    case "video": {
      wrapper.classList.add("media");
      const asset = state.project.mediaAssets.find(
        (a) => clip.source.kind === "media" && a.id === clip.source.mediaId,
      );
      if (!asset) return null;

      if (isDemoPath(asset.path)) {
        content.append(createPlaceholderVisual(asset.name, "video"));
        wrapper.append(content);
        applyVisualTransform(wrapper, clip, localTimeSec, sample);
        wrapper.style.zIndex = String(
          computeZIndex(
            state,
            info.track.id,
            sample.zAbove ?? sample.layer === "source",
          ),
        );
        return wrapper;
      }

      const video = document.createElement("video");
      video.src = mediaUrl(asset.path);
      video.muted = false;
      video.volume = 1;
      video.playsInline = true;
      video.preload = "auto";
      video.currentTime = localTimeSec;
      video.addEventListener("error", () => {
        video.remove();
        if (!content.querySelector(".preview-placeholder")) {
          content.append(createPlaceholderVisual(asset.name, "video"));
        }
      });
      content.append(video);
      wrapper.append(content);
      videoCache.set(clip.id, video);
      audioEngine.attach(video);
      applyVisualTransform(wrapper, clip, localTimeSec, sample);
      wrapper.style.zIndex = String(
        computeZIndex(
          state,
          info.track.id,
          sample.zAbove ?? sample.layer === "source",
        ),
      );
      return wrapper;
    }

    case "image": {
      wrapper.classList.add("media");
      const asset = state.project.mediaAssets.find(
        (a) => clip.source.kind === "media" && a.id === clip.source.mediaId,
      );
      if (!asset) return null;

      if (isDemoPath(asset.path)) {
        content.append(createPlaceholderVisual(asset.name, "image"));
        wrapper.append(content);
        applyVisualTransform(wrapper, clip, localTimeSec, sample);
        wrapper.style.zIndex = String(
          computeZIndex(
            state,
            info.track.id,
            sample.zAbove ?? sample.layer === "source",
          ),
        );
        return wrapper;
      }

      const img = document.createElement("img");
      img.src = mediaUrl(asset.path);
      img.alt = asset.name;
      img.addEventListener("error", () => {
        img.remove();
        if (!content.querySelector(".preview-placeholder")) {
          content.append(createPlaceholderVisual(asset.name, "image"));
        }
      });
      content.append(img);
      wrapper.append(content);
      applyVisualTransform(wrapper, clip, localTimeSec, sample);
      wrapper.style.zIndex = String(
        computeZIndex(
          state,
          info.track.id,
          sample.zAbove ?? sample.layer === "source",
        ),
      );
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
   UPDATE CLIP VISUAL (per frame)
   ============================================================ */
export function updateClipVisual(
  el: HTMLElement,
  info: ActiveClipInfo,
  playing: boolean,
  state: AppState,
  audioEngine: AudioEngine,
): void {
  const { clip, track, visualType, localTimeSec } = info;
  const timeSec = state.playback.currentTimeSec;

  const sample = getTransitionSample(state, clip.id, timeSec);
  applyVisualTransform(el, clip, localTimeSec, sample);
  el.style.zIndex = String(
    computeZIndex(
      state,
      info.track.id,
      sample.zAbove ?? sample.layer === "source",
      clip.kind === "text",
    ),
  );

  /* Sync animation class on content */
  const contentEl = el.querySelector<HTMLElement>(".preview-clip-content");
  if (contentEl) syncAnimationClass(contentEl, clip.animation);

  /* Video audio params */
  if (visualType === "video") {
    const video = el.querySelector<HTMLVideoElement>("video");
    if (video) {
      const clipAudio = clip.audio ?? DEFAULT_CLIP_AUDIO;
      const muted = track.muted || clipAudio.muted;
      const fadeMul =
        computeClipVolume(clip, Math.max(0, localTimeSec)) * sample.volume;

      audioEngine.setParams(video, {
        volume: clipAudio.volume,
        boostDb: clipAudio.boostDb,
        pan: clipAudio.pan,
        muted,
        fadeMultiplier: fadeMul,
      });
    }
  }

  switch (visualType) {
    case "text": {
      const textEl = el.querySelector<HTMLElement>(".preview-text");
      if (textEl && clip.source.kind === "text") {
        if (textEl.textContent !== clip.source.content) {
          textEl.textContent = clip.source.content;
        }
        applyTextClipStyle(textEl, clip.source.style ?? DEFAULT_TEXT_STYLE);
      }
      return;
    }

    case "video": {
      const video = el.querySelector<HTMLVideoElement>("video");
      if (!video) return;

      if (playing) {
        if (Math.abs(video.currentTime - localTimeSec) > 0.3) {
          video.currentTime = localTimeSec;
        }
        if (video.paused) {
          video.play().catch(() => {
            /* autoplay blocked */
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
