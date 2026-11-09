import type { AppState } from "@shared/types/state";
import { DEFAULT_CLIP_AUDIO } from "@shared/types/timeline";
import { getContentDurationSec } from "@state/selectors";
import { mediaUrl } from "@utils/media-url";

/* ============================================================
   AUDIO ENCODER
   ------------------------------------------------------------
   Render audio track ke WAV via OfflineAudioContext.

   MVP scope:
   - Audio clips di track A1/A2 (kind === 'audio')
   - Volume + boost + fade in/out
   - Video embedded audio NOT included (limitation — future)
   - Track mute di-hormati

   Offline render = deterministic, cepat (bukan real-time).
   ============================================================ */

const SAMPLE_RATE = 48000;
const CHANNELS = 2;

export async function renderAudioWav(state: AppState): Promise<ArrayBuffer> {
  const durationSec = getContentDurationSec(state);
  if (durationSec <= 0) {
    /* Silence buffer minimal 1 sample supaya ffmpeg valid. */
    return encodeAudioBufferToWav(
      new AudioBuffer({
        numberOfChannels: CHANNELS,
        length: 1,
        sampleRate: SAMPLE_RATE,
      }),
    );
  }

  const frames = Math.ceil(durationSec * SAMPLE_RATE);
  const offline = new OfflineAudioContext(CHANNELS, frames, SAMPLE_RATE);

  /* Decode semua audio assets (dedupe by assetId). */
  const audioBuffers = new Map<string, AudioBuffer>();
  const audioAssets = state.project.mediaAssets.filter(
    (a) => a.kind === "audio",
  );

  await Promise.all(
    audioAssets.map(async (asset) => {
      try {
        const resp = await fetch(mediaUrl(asset.path));
        const raw = await resp.arrayBuffer();
        const decoded = await offline.decodeAudioData(raw.slice(0));
        audioBuffers.set(asset.id, decoded);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[export-audio] decode failed:", asset.path, err);
      }
    }),
  );

  /* Schedule setiap clip. */
  for (const track of state.project.sequence.tracks) {
    if (track.kind !== "audio" || track.muted) continue;

    for (const clip of track.clips) {
      if (clip.kind !== "audio") continue;
      if (clip.source.kind !== "media") continue;

      const buf = audioBuffers.get(clip.source.mediaId);
      if (!buf) continue;

      const src = offline.createBufferSource();
      src.buffer = buf;

      const gain = offline.createGain();
      src.connect(gain);
      gain.connect(offline.destination);

      const clipAudio = clip.audio ?? DEFAULT_CLIP_AUDIO;
      const baseVol = clipAudio.muted ? 0 : clipAudio.volume / 100;
      const boost = Math.pow(10, clipAudio.boostDb / 20);
      const targetVol = Math.min(4, baseVol * boost);

      const t0 = clip.startSec;
      const t1 = t0 + clip.durationSec;

      /* Fade in. */
      if (clipAudio.fadeInSec > 0 && t0 + clipAudio.fadeInSec <= t1) {
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(targetVol, t0 + clipAudio.fadeInSec);
      } else {
        gain.gain.setValueAtTime(targetVol, t0);
      }

      /* Fade out. */
      if (clipAudio.fadeOutSec > 0 && t1 - clipAudio.fadeOutSec >= t0) {
        gain.gain.setValueAtTime(targetVol, t1 - clipAudio.fadeOutSec);
        gain.gain.linearRampToValueAtTime(0, t1);
      }

      src.start(t0);
      src.stop(t1);
    }
  }

  const rendered = await offline.startRendering();
  return encodeAudioBufferToWav(rendered);
}

/* ---- WAV encoder (16-bit PCM) ---- */

function encodeAudioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numCh = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = len * blockAlign;
  const bufSize = 44 + dataSize;

  const ab = new ArrayBuffer(bufSize);
  const view = new DataView(ab);

  const writeStr = (off: number, str: string): void => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(off + i, str.charCodeAt(i));
    }
  };

  writeStr(0, "RIFF");
  view.setUint32(4, bufSize - 8, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c));

  let offset = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c]![i]!));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }

  return ab;
}
