import type { AppState } from "@shared/types/state";
import type { Clip, Track } from "@shared/types/timeline";

/* ============================================================
   PREVIEW COMPOSITING LOGIC
   ------------------------------------------------------------
   Pure helper untuk menentukan clip apa yang aktif di playhead
   tertentu, dan bagaimana merendernya.
   ============================================================ */

export type VisualType = "video" | "image" | "text" | "unsupported";

export interface ActiveClipInfo {
  readonly clip: Clip;
  readonly track: Track;
  readonly localTimeSec: number;
  readonly visualType: VisualType;
}

/**
 * Kumpulkan clip aktif di semua video track pada waktu tertentu.
 * Urutan array = urutan paint (bottom → top): track index N-1
 * pertama, index 0 terakhir.
 *
 * Audio track & track hidden di-skip.
 */
export function getActiveClipsAtTime(
  state: AppState,
  timeSec: number,
): ActiveClipInfo[] {
  const result: ActiveClipInfo[] = [];
  const tracks = state.project.sequence.tracks;

  for (let i = tracks.length - 1; i >= 0; i--) {
    const track = tracks[i];
    if (!track || track.kind !== "video" || track.hidden) continue;

    for (const clip of track.clips) {
      const end = clip.startSec + clip.durationSec;
      if (timeSec >= clip.startSec && timeSec < end) {
        result.push({
          clip,
          track,
          localTimeSec: timeSec - clip.startSec,
          visualType: resolveVisualType(clip, state),
        });
      }
    }
  }

  return result;
}

function resolveVisualType(clip: Clip, state: AppState): VisualType {
  if (clip.kind === "text") return "text";
  if (clip.kind === "audio") return "unsupported";

  const asset = state.project.mediaAssets.find(
    (a) => a.id === clip.source.mediaId,
  );
  if (!asset) return "unsupported";
  if (asset.kind === "video") return "video";
  if (asset.kind === "image") return "image";
  return "unsupported";
}
