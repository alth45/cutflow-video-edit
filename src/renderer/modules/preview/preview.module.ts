import { setChildren } from "@core/Dom";
import { setIconPath } from "@core/icons";
import { appStore } from "@state/appStore";
import type { AppState } from "@shared/types/state";
import { mediaUrl, isDemoPath } from "@utils/media-url";
import { renderPreview, type PreviewView } from "./preview.view";
import { attachPreviewController } from "./preview.controller";
import { createPlaybackTicker } from "./playback.ticker";
import { formatTimecode } from "./playback.logic";
import {
  getActiveClipsAtTime,
  getTransitionSample,
  sequenceHasAnyClip,
  isClipActiveAt,
  type ActiveClipInfo,
} from "./preview.logic";
import {
  DEFAULT_CLIP_TRANSFORM,
  DEFAULT_CLIP_COLOR,
  DEFAULT_CLIP_AUDIO,
  DEFAULT_TEXT_STYLE,
} from "@shared/types/timeline";
import type {
  Clip,
  ClipTransform,
  ClipColor,
  ClipAudio,
  TextClipStyle,
} from "@shared/types/timeline";

import { getClipById } from "@state/selectors";
import { pixelDeltaToPosition, clampPosition } from "./overlay-drag.logic";
import * as actions from "@state/actions";
import { on } from "@core/Dom";
import {
  buildFilterString,
  getVignetteStrength,
} from "@modules/effects/effect.logic";
import { AudioEngine } from "./audio-engine";
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
  const audioCache = new Map<string, HTMLAudioElement>();
  const audioEngine = new AudioEngine();

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

    const selectionChanged =
      state.selection.selectedClipIds !== prev.selection.selectedClipIds;

    if (timeChanged || seqChanged || playStateChanged || selectionChanged) {
      renderComposite(view, state, videoCache, renderedClips, audioEngine);
      syncAudio(state, state.playback.playing, audioCache, audioEngine);
    }
  });

  /* Initial composite render (di F5 default state = kosong). */
  renderComposite(view, initial, videoCache, renderedClips, audioEngine);
  syncAudio(initial, false, audioCache, audioEngine);
  /* Attach overlay drag + selection outline sync. */
  const detachDrag = attachOverlayDrag(view);
  const detachResize = attachOverlayResize(view); // ← TAMBAH

  const detach = attachPreviewController(view);

  return () => {
    detachDrag();
    detachResize();
    detach();
    unsubscribe();
    ticker.stop();
    for (const video of videoCache.values()) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    videoCache.clear();
    for (const audio of audioCache.values()) {
      // ← TAMBAH
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    audioCache.clear();
    renderedClips.clear();
    audioEngine.dispose();
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
  audioEngine: AudioEngine,
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
        audioEngine.detach(video);
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
      const created = createClipVisual(info, state, videoCache, audioEngine);
      if (!created) continue;
      composite.append(created);
      renderedClips.set(info.clip.id, created);
      el = created;
    }

    updateClipVisual(el, info, playing, state, audioEngine);
  }
  /* Sync .selected class pada clip overlay aktif. */
  const activeSelectedId = state.selection.selectedClipIds[0] ?? null;
  for (const [clipId, el] of renderedClips) {
    el.classList.toggle("selected", clipId === activeSelectedId);
  }

  /* Position selection overlay at selected clip bounds. */
  updateSelectionOverlay(view, renderedClips);
}

/* ============================================================
   CLIP VISUAL FACTORY
   ============================================================ */

function createClipVisual(
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

  switch (visualType) {
    // case "text": {
    //   wrapper.classList.add("text");
    //   const textEl = document.createElement("div");
    //   textEl.className = "preview-text";
    //   textEl.textContent =
    //     clip.source.kind === "text" ? clip.source.content : "";
    //   content.append(textEl);
    //   wrapper.append(content);
    //   applyVisualTransform(wrapper, clip);
    //   return wrapper;
    // }
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
      const sample = getTransitionSample(
        state,
        clip.id,
        state.playback.currentTimeSec,
      );
      applyVisualTransform(
        wrapper,
        clip,
        sample.opacity,
        sample.translateX ?? 0,
      );
      wrapper.style.zIndex = String(
        computeZIndex(state, info.track.id, sample.layer === "source"),
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
        const sample = getTransitionSample(
          state,
          clip.id,
          state.playback.currentTimeSec,
        );
        applyVisualTransform(
          wrapper,
          clip,
          sample.opacity,
          sample.translateX ?? 0,
        );
        wrapper.style.zIndex = String(
          computeZIndex(state, info.track.id, sample.layer === "source"),
        );
        return wrapper;
      }

      const video = document.createElement("video");
      video.src = mediaUrl(asset.path);
      video.muted = false;
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
      applyVisualTransform(wrapper, clip);
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
        const sample = getTransitionSample(
          state,
          clip.id,
          state.playback.currentTimeSec,
        );
        applyVisualTransform(
          wrapper,
          clip,
          sample.opacity,
          sample.translateX ?? 0,
        );
        wrapper.style.zIndex = String(
          computeZIndex(state, info.track.id, sample.layer === "source"),
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
      applyVisualTransform(wrapper, clip);
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
  state: AppState,
  audioEngine: AudioEngine,
): void {
  const { clip, track, visualType, localTimeSec } = info;
  const timeSec = state.playback.currentTimeSec;

  const sample = getTransitionSample(state, clip.id, timeSec);
  applyVisualTransform(el, clip, sample.opacity, sample.translateX ?? 0);
  el.style.zIndex = String(
    computeZIndex(state, track.id, sample.layer === "source"),
  );

  /* Video audio — unmute + volume + fade, kali transition opacity. */
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
   Z-INDEX COMPUTATION
   ------------------------------------------------------------
   Z-index berbasis track index (track 0 = top = tertinggi).
   Transition source (beforeClip fade-out) mendapat +1 supaya
   paint di atas target (afterClip), menghasilkan cross-dissolve
   yang benar.
   ============================================================ */

function computeZIndex(
  state: AppState,
  trackId: string,
  isSource: boolean,
): number {
  const tracks = state.project.sequence.tracks;
  const idx = tracks.findIndex((t) => t.id === trackId);
  if (idx < 0) return 1;

  const base = (tracks.length - idx) * 10;
  return isSource ? base + 1 : base;
}

/* ============================================================
   AUDIO PLAYBACK (F14s)
   ------------------------------------------------------------
   Audio clips play via <audio> elements. Video clips' embedded
   audio handled in updateClipVisual (unmute + volume).
   ============================================================ */

function syncAudio(
  state: AppState,
  playing: boolean,
  audioCache: Map<string, HTMLAudioElement>,
  audioEngine: AudioEngine,
): void {
  const timeSec = state.playback.currentTimeSec;
  const activeAudioIds = new Set<string>();

  for (const track of state.project.sequence.tracks) {
    if (track.kind !== "audio") continue;

    for (const clip of track.clips) {
      if (clip.kind !== "audio") continue;
      // const end = clip.startSec + clip.durationSec;
      if (!isClipActiveAt(track, clip, timeSec)) continue;
      activeAudioIds.add(clip.id);

      const asset = state.project.mediaAssets.find(
        (a) => clip.source.kind === "media" && a.id === clip.source.mediaId,
      );
      if (!asset || isDemoPath(asset.path)) continue;

      const localTimeSec = timeSec - clip.startSec;

      let audio = audioCache.get(clip.id);
      if (!audio) {
        audio = document.createElement("audio");
        audio.src = mediaUrl(asset.path);
        audio.preload = "auto";
        /* Neutralize element-level control (Web Audio handles it). */
        audio.volume = 1;
        audio.muted = false;
        audioEngine.attach(audio);
        audioCache.set(clip.id, audio);
      }

      const clipAudio = clip.audio ?? DEFAULT_CLIP_AUDIO;
      const muted = track.muted || clipAudio.muted;
      const sample = getTransitionSample(state, clip.id, timeSec);
      const fadeMul =
        computeClipVolume(clip, Math.max(0, localTimeSec)) * sample.volume;

      audioEngine.setParams(audio, {
        volume: clipAudio.volume,
        boostDb: clipAudio.boostDb,
        pan: clipAudio.pan,
        muted,
        fadeMultiplier: fadeMul,
      });

      if (playing) {
        audioEngine.ensureRunning();
        if (Math.abs(audio.currentTime - localTimeSec) > 0.3) {
          audio.currentTime = localTimeSec;
        }
        if (audio.paused) {
          audio.play().catch(() => {
            /* autoplay blocked */
          });
        }
      } else {
        if (!audio.paused) audio.pause();
        if (Math.abs(audio.currentTime - localTimeSec) > 0.05) {
          audio.currentTime = localTimeSec;
        }
      }
    }
  }

  /* Cleanup inactive audio */
  for (const [clipId, audio] of audioCache) {
    if (!activeAudioIds.has(clipId)) {
      audio.pause();
      audioEngine.detach(audio);
      audio.removeAttribute("src");
      audio.load();
      audioCache.delete(clipId);
    }
  }
}

/**
 * Hitung volume efektif clip pada local time tertentu, dengan fade
 * envelope. Return 0..1 (linear). Muted di-handle terpisah di caller.
 */
function computeClipVolume(clip: Clip, localTimeSec: number): number {
  const audio = clip.audio ?? DEFAULT_CLIP_AUDIO;
  let vol = audio.volume / 100;

  const dur = clip.durationSec;
  if (audio.fadeInSec > 0 && localTimeSec < audio.fadeInSec) {
    vol *= localTimeSec / audio.fadeInSec;
  }
  if (audio.fadeOutSec > 0 && localTimeSec > dur - audio.fadeOutSec) {
    vol *= (dur - localTimeSec) / audio.fadeOutSec;
  }

  return Math.max(0, Math.min(1, vol));
}

/* ============================================================
   APPLY CLIP TRANSFORM
   ------------------------------------------------------------
   Terapkan transform (position, scale, rotation, opacity, crop,
   feather) ke wrapper `.preview-clip`. Wrapper full-size, jadi
   transform relatif ke wrapper = relatif ke monitor.
   ============================================================ */
function applyVisualTransform(
  wrapper: HTMLElement,
  clip: Clip,
  transitionOpacity: number = 1,
  transitionTranslateX: number = 0,
): void {
  const t = clip.transform ?? DEFAULT_CLIP_TRANSFORM;
  const c = clip.color ?? DEFAULT_CLIP_COLOR;

  /* ---- Transform (base + transition slide) ---- */
  const xPct = t.positionX / 2 + transitionTranslateX;
  const yPct = t.positionY / 2;

  wrapper.style.transform = [
    `translate(${xPct}%, ${yPct}%)`,
    `rotate(${t.rotation}deg)`,
    `scale(${t.scale / 100})`,
  ].join(" ");
  wrapper.style.transformOrigin = "center center";

  wrapper.style.opacity = String((t.opacity / 100) * transitionOpacity);

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
  /* ---- Color correction + effects ---- */
  wrapper.style.filter = buildFilterString(clip);

  /* Vignette overlay */
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
   TEXT CLIP STYLE (F14z)
   ============================================================ */

function applyTextClipStyle(el: HTMLElement, style: TextClipStyle): void {
  el.style.fontFamily = style.fontFamily;
  el.style.fontWeight = String(style.fontWeight);
  el.style.fontStyle = style.fontStyle;
  el.style.textDecoration = style.underline ? "underline" : "none";

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
    el.style.textShadow = "0 2px 8px rgba(0,0,0,.85), 0 1px 2px rgba(0,0,0,.9)";
  }
}

/* ============================================================
   OVERLAY DRAG (F14t)
   ------------------------------------------------------------
   Klik-hold pada selection box (.preview-clip.selected) → drag
   untuk ubah positionX/positionY.

   Selama drag: DOM-only update (smooth). Mouseup: commit
   via `setClipTransformBulk` (1 history entry).

   Hanya aktif saat paused (playing = no-op).
   ============================================================ */

interface DragState {
  readonly clipId: string;
  readonly element: HTMLElement;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly startPositionX: number;
  readonly startPositionY: number;
  readonly monitorWidth: number;
  readonly monitorHeight: number;
  readonly rotation: number;
  readonly scale: number;
  moved: boolean;
  lastX: number;
  lastY: number;
}

function attachOverlayDrag(view: PreviewView): () => void {
  let drag: DragState | null = null;

  const onMouseDown = (ev: MouseEvent): void => {
    if (ev.button !== 0) return;

    const state = appStore.getState();
    if (state.playback.playing) return;

    const target = ev.target as Element;
    if (!target) return;

    const clipEl = target.closest<HTMLElement>(".preview-clip.selected");
    if (!clipEl) return;

    const clipId = clipEl.dataset["clipId"];
    if (!clipId) return;

    const clip = getClipById(state, clipId);
    if (!clip) return;

    const track = state.project.sequence.tracks.find((t) =>
      t.clips.some((c) => c.id === clipId),
    );
    if (!track || track.locked) return;

    const monitorRect = view.monitor.getBoundingClientRect();
    if (monitorRect.width <= 0 || monitorRect.height <= 0) return;

    const t = clip.transform ?? DEFAULT_CLIP_TRANSFORM;

    drag = {
      clipId,
      element: clipEl,
      startClientX: ev.clientX,
      startClientY: ev.clientY,
      startPositionX: t.positionX,
      startPositionY: t.positionY,
      monitorWidth: monitorRect.width,
      monitorHeight: monitorRect.height,
      rotation: t.rotation,
      scale: t.scale,
      moved: false,
      lastX: t.positionX,
      lastY: t.positionY,
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    ev.preventDefault();
    ev.stopPropagation();
  };

  const onMouseMove = (ev: MouseEvent): void => {
    if (!drag) return;

    const dx = ev.clientX - drag.startClientX;
    const dy = ev.clientY - drag.startClientY;

    if (!drag.moved && Math.hypot(dx, dy) < 3) return;
    drag.moved = true;

    const delta = pixelDeltaToPosition(
      dx,
      dy,
      drag.monitorWidth,
      drag.monitorHeight,
    );
    const newX = clampPosition(drag.startPositionX + delta.x);
    const newY = clampPosition(drag.startPositionY + delta.y);
    drag.lastX = newX;
    drag.lastY = newY;

    /* DOM-only update (smooth during drag). */
    const xPct = newX / 2;
    const yPct = newY / 2;
    drag.element.style.transform = `translate(${xPct}%, ${yPct}%) rotate(${drag.rotation}deg) scale(${drag.scale / 100})`;
    refreshOverlayFromDom(view);
  };

  const onMouseUp = (): void => {
    if (!drag) return;
    const { clipId, startPositionX, startPositionY, lastX, lastY, moved } =
      drag;

    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    drag = null;

    if (!moved) return;
    if (
      Math.abs(lastX - startPositionX) < 0.05 &&
      Math.abs(lastY - startPositionY) < 0.05
    ) {
      return;
    }

    /* Commit — 1 history entry. */
    actions.setClipTransformBulk(clipId, {
      positionX: Math.round(lastX * 10) / 10,
      positionY: Math.round(lastY * 10) / 10,
    });
  };

  return on(view.compositeLayer, "mousedown", onMouseDown as EventListener);
}

/* ============================================================
   SELECTION OVERLAY (F14u)
   ------------------------------------------------------------
   Overlay terpisah di `.monitor` (di luar transform chain clip).
   Bounds di-sync dari `.preview-clip-content` getBoundingClientRect
   setiap render. Handles selalu axis-aligned (tidak ikut rotate/scale).
   ============================================================ */

function updateSelectionOverlay(
  view: PreviewView,
  renderedClips: Map<string, HTMLElement>,
): void {
  const state = appStore.getState();
  const selectedId = state.selection.selectedClipIds[0];

  if (!selectedId) {
    view.selectionOverlay.style.display = "none";
    return;
  }

  const clipEl = renderedClips.get(selectedId);
  if (!clipEl) {
    view.selectionOverlay.style.display = "none";
    return;
  }

  const content = clipEl.querySelector<HTMLElement>(".preview-clip-content");
  if (!content) {
    view.selectionOverlay.style.display = "none";
    return;
  }

  const monitorRect = view.monitor.getBoundingClientRect();
  const contentRect = content.getBoundingClientRect();

  if (contentRect.width <= 0 || contentRect.height <= 0) {
    view.selectionOverlay.style.display = "none";
    return;
  }

  view.selectionOverlay.style.display = "block";
  view.selectionOverlay.style.left = `${contentRect.left - monitorRect.left}px`;
  view.selectionOverlay.style.top = `${contentRect.top - monitorRect.top}px`;
  view.selectionOverlay.style.width = `${contentRect.width}px`;
  view.selectionOverlay.style.height = `${contentRect.height}px`;
}

function refreshOverlayFromDom(view: PreviewView): void {
  const selectedId = appStore.getState().selection.selectedClipIds[0];
  if (!selectedId) return;

  const clipEl = view.compositeLayer.querySelector<HTMLElement>(
    `.preview-clip[data-clip-id="${selectedId}"]`,
  );
  if (!clipEl) return;
  const content = clipEl.querySelector<HTMLElement>(".preview-clip-content");
  if (!content) return;

  const monitorRect = view.monitor.getBoundingClientRect();
  const contentRect = content.getBoundingClientRect();
  if (contentRect.width <= 0 || contentRect.height <= 0) return;

  const overlay = view.selectionOverlay;
  overlay.style.left = `${contentRect.left - monitorRect.left}px`;
  overlay.style.top = `${contentRect.top - monitorRect.top}px`;
  overlay.style.width = `${contentRect.width}px`;
  overlay.style.height = `${contentRect.height}px`;
}

/* ============================================================
   OVERLAY RESIZE (F14u)
   ------------------------------------------------------------
   Drag corner handle → scale uniform around center.
   Formula: newWidth = startWidth + 2*delta
            delta = (dx*signX + dy*signY) / 2
   sign = +1 untuk side kanan/bawah, -1 untuk kiri/atas.
   ============================================================ */

interface ResizeState {
  readonly clipId: string;
  readonly startScale: number;
  readonly startWidth: number;
  readonly startX: number;
  readonly startY: number;
  readonly signX: 1 | -1;
  readonly signY: 1 | -1;
  moved: boolean;
  lastScale: number;
}

function attachOverlayResize(view: PreviewView): () => void {
  let resize: ResizeState | null = null;

  const onMouseDown = (ev: MouseEvent): void => {
    if (ev.button !== 0) return;

    const state = appStore.getState();
    if (state.playback.playing) return;

    const target = ev.target as Element;
    if (!target) return;

    const handleEl = target.closest<HTMLElement>(".preview-handle");
    if (!handleEl) return;

    const selectedId = state.selection.selectedClipIds[0];
    if (!selectedId) return;

    const clip = getClipById(state, selectedId);
    if (!clip) return;

    const track = state.project.sequence.tracks.find((t) =>
      t.clips.some((c) => c.id === selectedId),
    );
    if (!track || track.locked) return;

    const width = parseFloat(view.selectionOverlay.style.width) || 0;
    if (width <= 0) return;

    const handlePos = handleEl.dataset["handle"];
    const signX: 1 | -1 = handlePos === "nw" || handlePos === "sw" ? -1 : 1;
    const signY: 1 | -1 = handlePos === "nw" || handlePos === "ne" ? -1 : 1;

    const t = clip.transform ?? DEFAULT_CLIP_TRANSFORM;

    resize = {
      clipId: selectedId,
      startScale: t.scale,
      startWidth: width,
      startX: ev.clientX,
      startY: ev.clientY,
      signX,
      signY,
      moved: false,
      lastScale: t.scale,
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.userSelect = "none";
    ev.preventDefault();
    ev.stopPropagation();
  };

  const onMouseMove = (ev: MouseEvent): void => {
    if (!resize) return;

    const dx = ev.clientX - resize.startX;
    const dy = ev.clientY - resize.startY;

    if (!resize.moved && Math.hypot(dx, dy) < 3) return;
    resize.moved = true;

    const delta = (dx * resize.signX + dy * resize.signY) / 2;
    const newWidth = resize.startWidth + 2 * delta;
    if (newWidth <= 0) return;

    const newScale = Math.max(
      10,
      Math.min(200, resize.startScale * (newWidth / resize.startWidth)),
    );
    resize.lastScale = newScale;

    /* DOM-only update (smooth during resize). */
    const clipEl = view.compositeLayer.querySelector<HTMLElement>(
      `.preview-clip[data-clip-id="${resize.clipId}"]`,
    );
    if (!clipEl) return;

    const state = appStore.getState();
    const clip = getClipById(state, resize.clipId);
    if (!clip) return;
    const t = clip.transform ?? DEFAULT_CLIP_TRANSFORM;
    const xPct = t.positionX / 2;
    const yPct = t.positionY / 2;
    clipEl.style.transform = `translate(${xPct}%, ${yPct}%) rotate(${t.rotation}deg) scale(${newScale / 100})`;

    refreshOverlayFromDom(view);
  };

  const onMouseUp = (): void => {
    if (!resize) return;
    const { clipId, startScale, lastScale, moved } = resize;

    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.body.style.userSelect = "";
    resize = null;

    if (!moved) return;
    if (Math.abs(lastScale - startScale) < 0.5) return;

    actions.setClipTransformBulk(clipId, {
      scale: Math.round(lastScale * 10) / 10,
    });
  };

  return on(view.selectionOverlay, "mousedown", onMouseDown as EventListener);
}
