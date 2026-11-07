import type { AppState } from "@shared/types/state";
import { DEFAULT_CLIP_AUDIO } from "@shared/types/timeline";
import { mediaUrl, isDemoPath } from "@utils/media-url";
import {
  isClipActiveAt,
  getTransitionSample,
  computeClipVolume,
} from "./preview.logic";
import type { AudioEngine } from "./audio-engine";

/* ============================================================
   AUDIO SYNC
   ------------------------------------------------------------
   Audio clips play via <audio> elements. Video embedded audio
   handled di updateClipVisual (unmute + volume + pan via engine).
   ============================================================ */
export function syncAudio(
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
        /* Neutralize element-level (Web Audio handles volume). */
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
