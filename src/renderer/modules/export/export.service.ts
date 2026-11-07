import type { AppState } from "@shared/types/state";
import { getMediaById, getContentDurationSec } from "@state/selectors";
import {
  getActiveClipsAtTime,
  getTransitionSample,
  computeClipVolume,
} from "@modules/preview/preview.logic";
import { getEffectiveTransform } from "@modules/keyframes/keyframe.logic";
import { mediaUrl, isDemoPath } from "@utils/media-url";
import { DEFAULT_CLIP_AUDIO, DEFAULT_TEXT_STYLE } from "@shared/types/timeline";

/* ============================================================
   EXPORT SERVICE (F14ag — updated)
   ------------------------------------------------------------
   Fix 1: use CONTENT duration (max clip end) — bukan sequence
   duration. Kalau user trim audio ke 7s tapi sequence masih 120s
   dari initial auto-extend, export = 7s.

   Fix 2: include audio track. Route semua media element (video
   + audio) melalui AudioContext → MediaStreamDestination.
   Combine dengan canvas video track → MediaRecorder capture
   audio + video.
   ============================================================ */

interface ClipMedia {
  element: HTMLVideoElement | HTMLAudioElement | HTMLImageElement;
  gain?: GainNode;
}

export async function exportProject(
  state: AppState,
  onProgress: (pct: number) => void,
): Promise<void> {
  const res = await window.cutflow.export.begin();
  if (!res.ok) throw new Error("Export canceled");

  const seq = state.project.sequence;
  const contentDuration = getContentDurationSec(state);
  if (contentDuration <= 0) throw new Error("Nothing to export");

  /* ---- Canvas ---- */
  const canvas = document.createElement("canvas");
  canvas.width = seq.width;
  canvas.height = seq.height;
  const ctx = canvas.getContext("2d")!;

  /* ---- Audio setup ---- */
  const audioCtx = new AudioContext();
  const audioDest = audioCtx.createMediaStreamDestination();
  await audioCtx.resume();

  /* ---- Per-clip media elements (NOT per-asset — handle multiple
          clips using same source with independent seek/audio) ---- */
  const mediaByClip = new Map<string, ClipMedia>();

  for (const track of seq.tracks) {
    for (const clip of track.clips) {
      if (clip.source.kind !== "media") continue;
      const asset = getMediaById(state, clip.source.mediaId);
      if (!asset || isDemoPath(asset.path)) continue;

      if (asset.kind === "video") {
        const v = document.createElement("video");
        v.src = mediaUrl(asset.path);
        v.crossOrigin = "anonymous";
        v.muted = false;
        v.volume = 1;
        v.preload = "auto";
        v.playsInline = true;
        mediaByClip.set(clip.id, { element: v });
      } else if (asset.kind === "audio") {
        const a = document.createElement("audio");
        a.src = mediaUrl(asset.path);
        a.crossOrigin = "anonymous";
        a.volume = 1;
        a.preload = "auto";
        mediaByClip.set(clip.id, { element: a });
      } else if (asset.kind === "image") {
        const img = document.createElement("img");
        img.src = mediaUrl(asset.path);
        mediaByClip.set(clip.id, { element: img });
      }
    }
  }

  /* ---- Attach audio source nodes (video + audio elements) ---- */
  for (const [clipId, entry] of mediaByClip) {
    const el = entry.element;
    if (el instanceof HTMLVideoElement || el instanceof HTMLAudioElement) {
      try {
        const source = audioCtx.createMediaElementSource(el);
        const gain = audioCtx.createGain();
        gain.gain.value = 0;
        source.connect(gain);
        gain.connect(audioDest);
        entry.gain = gain;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[export] audio attach failed for clip", clipId, err);
      }
    }
  }

  /* ---- Wait for media to load ---- */
  await Promise.all(
    Array.from(mediaByClip.values()).map((entry) => {
      const el = entry.element;
      if (el instanceof HTMLVideoElement) {
        return new Promise<void>((r) => {
          el.onloadeddata = () => r();
          el.onerror = () => r();
        });
      }
      if (el instanceof HTMLAudioElement) {
        return new Promise<void>((r) => {
          el.onloadedmetadata = () => r();
          el.onerror = () => r();
        });
      }
      if (el instanceof HTMLImageElement) {
        return new Promise<void>((r) => {
          el.onload = () => r();
          el.onerror = () => r();
        });
      }
      return Promise.resolve();
    }),
  );

  /* ---- Combine canvas video + audio destination tracks ---- */
  const videoStream = canvas.captureStream(seq.fps);
  const combinedStream = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...audioDest.stream.getAudioTracks(),
  ]);

  /* MIME type fallback — VP9+Opus preferred, VP8+Opus, else webm */
  const mimeCandidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  const mimeType =
    mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ??
    "video/webm";

  const recorder = new MediaRecorder(combinedStream, { mimeType });

  recorder.ondataavailable = async (e) => {
    if (e.data.size > 0) {
      const buf = await e.data.arrayBuffer();
      window.cutflow.export.chunk(new Uint8Array(buf));
    }
  };

  return new Promise((resolve, reject) => {
    recorder.onstop = async () => {
      try {
        await window.cutflow.export.finish();
      } catch {
        /* */
      }

      /* Cleanup */
      for (const entry of mediaByClip.values()) {
        const el = entry.element;
        if (el instanceof HTMLVideoElement || el instanceof HTMLAudioElement) {
          el.pause();
          el.removeAttribute("src");
          el.load();
        }
        entry.gain?.disconnect();
      }
      mediaByClip.clear();
      audioCtx.close().catch(() => {});
      resolve();
    };

    recorder.onerror = (e) => {
      // eslint-disable-next-line no-console
      console.error("[export] recorder error:", e);
      window.cutflow.export.cancel();
      reject(e);
    };

    recorder.start(100);

    const startTime = performance.now();

    /* ---- Audio sync per frame ---- */
    const syncClipAudio = (elapsed: number): void => {
      const active = getActiveClipsAtTime(state, elapsed);
      const activeIds = new Set(active.map((a) => a.clip.id));

      for (const info of active) {
        const entry = mediaByClip.get(info.clip.id);
        if (!entry?.gain) continue;

        const { clip } = info;
        const localTime = elapsed - clip.startSec;

        const track = seq.tracks.find((t) =>
          t.clips.some((c) => c.id === clip.id),
        );
        const trackMuted = track?.muted ?? false;
        const sample = getTransitionSample(state, clip.id, elapsed);
        const clipAudio = clip.audio ?? DEFAULT_CLIP_AUDIO;

        const fadeMul =
          computeClipVolume(clip, Math.max(0, localTime)) * sample.volume;
        const baseVol = (clipAudio.volume / 100) * fadeMul;
        const boost = Math.pow(10, clipAudio.boostDb / 20);
        const target =
          trackMuted || clipAudio.muted ? 0 : Math.min(4, baseVol * boost);

        entry.gain.gain.value = target;

        const el = entry.element;
        if (el instanceof HTMLVideoElement || el instanceof HTMLAudioElement) {
          if (Math.abs(el.currentTime - localTime) > 0.25) {
            try {
              el.currentTime = Math.max(0, localTime);
            } catch {
              /* */
            }
          }
          if (el.paused && target > 0) {
            el.play().catch(() => {});
          }
        }
      }

      /* Pause inactive media */
      for (const [clipId, entry] of mediaByClip) {
        if (activeIds.has(clipId)) continue;
        const el = entry.element;
        if (el instanceof HTMLVideoElement || el instanceof HTMLAudioElement) {
          if (!el.paused) el.pause();
        }
      }
    };

    /* ---- Video draw per frame ---- */
    const drawFrame = (elapsed: number): void => {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const active = getActiveClipsAtTime(state, elapsed);

      for (const info of active) {
        const { clip } = info;
        const sample = getTransitionSample(state, clip.id, elapsed);
        if (sample.opacity <= 0) continue;

        ctx.save();

        const t = getEffectiveTransform(clip, elapsed - clip.startSec);
        const cx = canvas.width / 2 + (t.positionX / 200) * canvas.width;
        const cy = canvas.height / 2 + (t.positionY / 200) * canvas.height;
        ctx.translate(cx, cy);
        ctx.rotate((t.rotation * Math.PI) / 180);
        ctx.scale(t.scale / 100, t.scale / 100);
        ctx.globalAlpha = (t.opacity / 100) * sample.opacity;

        if (clip.source.kind === "media") {
          const entry = mediaByClip.get(clip.id);
          if (entry) {
            const media = entry.element;
            if (
              media instanceof HTMLVideoElement ||
              media instanceof HTMLImageElement
            ) {
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
                const canvasRatio = canvas.width / canvas.height;
                let drawW = canvas.width;
                let drawH = canvas.height;
                if (mediaRatio > canvasRatio) drawH = canvas.width / mediaRatio;
                else drawW = canvas.height * mediaRatio;
                try {
                  ctx.drawImage(media, -drawW / 2, -drawH / 2, drawW, drawH);
                } catch {
                  /* frame not ready */
                }
              }
            }
          }
        } else if (clip.source.kind === "text") {
          const style = clip.source.style ?? DEFAULT_TEXT_STYLE;
          const baseSize = canvas.height * 0.08;
          ctx.font = `${style.fontWeight === 700 ? "bold" : "normal"} ${baseSize}px ${style.fontFamily}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.shadowColor = "rgba(0,0,0,0.85)";
          ctx.shadowBlur = 8;

          const lines = clip.source.content.split("\n");
          const lineHeight = baseSize * 1.25;
          const totalHeight = lines.length * lineHeight;

          lines.forEach((line, i) => {
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
          });
        }

        ctx.restore();
      }
    };

    /* ---- Loop ---- */
    const loop = (): void => {
      const elapsed = (performance.now() - startTime) / 1000;
      if (elapsed >= contentDuration) {
        recorder.stop();
        return;
      }
      syncClipAudio(elapsed);
      drawFrame(elapsed);
      onProgress(Math.min(1, elapsed / contentDuration));
      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
  });
}
