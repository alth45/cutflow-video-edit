import type { AppState } from "@shared/types/state";
import { getContentDurationSec } from "@state/selectors";
import { renderAudioWav } from "./audio-encoder";
import { preloadMedia, drawFrame, type MediaCache } from "./frame-renderer";

/* ============================================================
   EXPORT SERVICE
   ------------------------------------------------------------
   Pipeline:
   1. Render audio → WAV → kirim ke main
   2. Preload video/image assets
   3. Spawn ffmpeg
   4. Loop frame-by-frame (deterministic, frame-accurate)
   5. Finish → MP4 ready
   ============================================================ */

export interface ExportPhase {
  readonly progress: number; // 0..1 overall
  readonly phase: string;
  readonly detail?: string;
}

export async function exportProject(
  state: AppState,
  onProgress: (p: ExportPhase) => void,
): Promise<void> {
  const seq = state.project.sequence;
  const contentDuration = getContentDurationSec(state);
  if (contentDuration <= 0) throw new Error("Nothing to export");

  /* ---- 1. Begin: save dialog ---- */
  const begin = await window.cutflow.export.begin({
    width: seq.width,
    height: seq.height,
    fps: seq.fps,
    durationSec: contentDuration,
  });
  if (!begin.ok) throw new Error("Export canceled");

  try {
    /* ---- 2. Render audio ---- */
    onProgress({ progress: 0.02, phase: "Rendering audio…" });
    const wav = await renderAudioWav(state);
    const audioRes = await window.cutflow.export.setAudio(wav);
    if (!audioRes.ok) throw new Error("Failed to send audio");

    /* ---- 3. Preload media ---- */
    onProgress({ progress: 0.08, phase: "Loading media…" });
    const mediaCache: MediaCache = new Map();
    await preloadMedia(state, mediaCache);

    /* ---- 4. Start ffmpeg ---- */
    onProgress({ progress: 0.12, phase: "Starting encoder…" });
    const startRes = await window.cutflow.export.startVideo();
    if (!startRes.ok)
      throw new Error(startRes.error ?? "Failed to start encoder");

    /* ---- 5. Render frame loop ---- */
    const canvas = document.createElement("canvas");
    canvas.width = seq.width;
    canvas.height = seq.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context unavailable");

    const totalFrames = Math.max(1, Math.ceil(contentDuration * seq.fps));

    for (let i = 0; i < totalFrames; i++) {
      const t = i / seq.fps;
      await drawFrame(ctx, state, t, mediaCache);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const frameRes = await window.cutflow.export.writeFrame(
        imageData.data.buffer,
      );
      if (!frameRes.ok) throw new Error("Encoder rejected frame");

      /* Progress: audio 12% → 92% frame, 8% finish */
      const frameProgress = 0.12 + 0.8 * ((i + 1) / totalFrames);
      onProgress({
        progress: frameProgress,
        phase: `Encoding frame ${i + 1} / ${totalFrames}`,
        detail: `${Math.round(((i + 1) / totalFrames) * 100)}%`,
      });
    }

    /* ---- 6. Finish ---- */
    onProgress({ progress: 0.95, phase: "Finalizing MP4…" });
    const finishRes = await window.cutflow.export.finish();
    if (!finishRes.ok) throw new Error(finishRes.error ?? "Finalize failed");

    onProgress({ progress: 1, phase: "Done" });
  } catch (err) {
    await window.cutflow.export.cancel();
    throw err;
  }
}
