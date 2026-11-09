import type { AppState } from "@shared/types/state";
import type { Sequence, MediaAsset } from "@shared/types/project";
import { TIMELINE } from "@shared/constants";
import type {
  Track,
  Clip,
  VideoClip,
  AudioClip,
  TextClip,
  Transition,
} from "@shared/types/timeline";

/* ============================================================
   SELECTORS
   ------------------------------------------------------------
   Fungsi MURNI untuk menurunkan nilai dari AppState.

   ATURAN:
   - Tidak import `appStore` — terima state sebagai parameter.
     → testable tanpa instance, tanpa mock, tanpa side-effect.
   - Tidak mutasi state (read-only access).
   - Pure: input sama → output sama (kecuali cache internal).
   - Return undefined/null untuk "tidak ada", bukan throw.

   KATEGORI:
   1. Simple getters — lookup & filter (O(1) atau O(n) kecil).
   2. Derived values — kalkulasi dari beberapa field.
   3. Memoized lookups — bangun Map cache, invalidasi via reference.

   YANG TIDAK DI SINI:
   - Side-effects (baca file, IPC) → bukan selector.
   - Mutasi state → actions.ts.
   - Format string (timecode, dsb) → @utils/timecode.ts.
   ============================================================ */

/* ============================================================
   PLAYBACK
   ============================================================ */

/**
 * Progress playhead 0..1.
 *
 * Rumus: `currentTimeSec / sequence.durationSec`.
 *
 * Defensif: kalau durationSec = 0 (edge case kalau user
 * aneh-aneh men-set), return 0 (bukan NaN/Infinity).
 */
export function getProgress(state: AppState): number {
  const duration = state.project.sequence.durationSec;
  if (duration <= 0) return 0;
  return Math.min(1, Math.max(0, state.playback.currentTimeSec / duration));
}

/**
 * Apakah playhead sudah mencapai akhir sequence?
 * Dipakai untuk auto-pause di akhir (F9 playback controller).
 */
export function isAtEnd(state: AppState): boolean {
  const { currentTimeSec } = state.playback;
  const { durationSec } = state.project.sequence;
  // Toleransi float: 1 frame dari akhir.
  const epsilon = 1 / state.project.sequence.fps;
  return currentTimeSec >= durationSec - epsilon;
}

/* ============================================================
   PROJECT & SEQUENCE
   ------------------------------------------------------------
   Lookup dasar. Sebagian besar consumer bisa akses
   `state.project.sequence` langsung, tapi selector memberi
   titik tunggal kalau nanti strukturnya berubah (mis. multi-sequence).
   ============================================================ */

export function getSequence(state: AppState): Sequence {
  return state.project.sequence;
}

/* ============================================================
   TRACK
   ============================================================ */

/**
 * Cari track berdasarkan ID.
 * O(n) dijumlah track (≤10 realistis).
 */
export function getTrackById(
  state: AppState,
  trackId: string,
): Track | undefined {
  return state.project.sequence.tracks.find((t) => t.id === trackId);
}

/** Track yang sedang aktif (dari selection). */
export function getActiveTrack(state: AppState): Track | undefined {
  const id = state.selection.activeTrackId;
  return id ? getTrackById(state, id) : undefined;
}

/** Semua track video (urutan display dipertahankan). */
export function getVideoTracks(state: AppState): readonly Track[] {
  return state.project.sequence.tracks.filter((t) => t.kind === "video");
}

/** Semua track audio. */
export function getAudioTracks(state: AppState): readonly Track[] {
  return state.project.sequence.tracks.filter((t) => t.kind === "audio");
}

/* ============================================================
   CLIP
   ============================================================ */

/**
 * Cari clip berdasarkan ID di SEMUA track.
 * O(n) dijumlah clip total. Realistis: <500 → ~10μs.
 *
 * Untuk lookup per-clip di render loop, lebih cepat pakai
 * `getClipMap(state)` (memoized di bawah).
 */
export function getClipById(state: AppState, clipId: string): Clip | undefined {
  for (const track of state.project.sequence.tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return clip;
  }
  return undefined;
}

/**
 * Clip yang sedang di-select (kalau ada).
 *
 * Karena `selectedClipIds` bisa berisi >1 clip di masa depan,
 * selector ini return clip pertama (atau undefined).
 * Untuk multi-select logic, pakai `getSelectedClips`.
 */
export function getActiveClip(state: AppState): Clip | undefined {
  const firstId = state.selection.selectedClipIds[0];
  return firstId ? getClipById(state, firstId) : undefined;
}

/** Semua clip yang di-select (filter yang tidak found). */
export function getSelectedClips(state: AppState): readonly Clip[] {
  if (state.selection.selectedClipIds.length === 0) return [];
  const result: Clip[] = [];
  for (const id of state.selection.selectedClipIds) {
    const clip = getClipById(state, id);
    if (clip) result.push(clip);
  }
  return result;
}

/**
 * Semua clip dalam satu track, di-sort by `startSec`.
 *
 * Store menyimpan clip tidak dijamin urut (untuk insert cepat),
 * tapi untuk render selalu butuh urut. Selector men-sort tanpa
 * mutasi input.
 */
export function getClipsInTrack(track: Track): readonly Clip[] {
  if (track.clips.length <= 1) return track.clips;
  return [...track.clips].sort((a, b) => a.startSec - b.startSec);
}

/** Type guard: apakah clip ini video. */
export function isVideoClip(clip: Clip): clip is VideoClip {
  return clip.kind === "video";
}

/** Type guard: apakah clip ini audio. */
export function isAudioClip(clip: Clip): clip is AudioClip {
  return clip.kind === "audio";
}

/** Type guard: apakah clip ini teks. */
export function isTextClip(clip: Clip): clip is TextClip {
  return clip.kind === "text";
}

/* ============================================================
   MEDIA ASSETS (memoized)
   ------------------------------------------------------------
   Lookup by ID dengan cache Map. Cache invalidasi otomatis
   kalau `project.mediaAssets` berubah referensi (immutability
   punya efek samping: reference berubah = ada edit).

   Kenapa memoize:
   - `getMediaById` dipanggil per-clip di render timeline.
     100 clips × find() linear = O(n×m). Dengan cache: O(1) per call.
   ============================================================ */

interface MediaCache {
  readonly source: readonly MediaAsset[];
  readonly map: Map<string, MediaAsset>;
}

let mediaCache: MediaCache | null = null;

function getMediaMap(
  mediaAssets: readonly MediaAsset[],
): Map<string, MediaAsset> {
  // Cache hit: sumber referensi sama (tidak ada edit).
  if (mediaCache && mediaCache.source === mediaAssets) {
    return mediaCache.map;
  }

  // Cache miss: bangun Map baru.
  const map = new Map<string, MediaAsset>();
  for (const asset of mediaAssets) {
    map.set(asset.id, asset);
  }

  mediaCache = { source: mediaAssets, map };
  return map;
}

/**
 * Ambil MediaAsset by ID (O(1) via cache).
 *
 * Cache di-invalidate otomatis saat `project.mediaAssets`
 * berubah referensi. Tidak ada TTL, tidak ada manual eviction.
 */
export function getMediaById(
  state: AppState,
  mediaId: string,
): MediaAsset | undefined {
  return getMediaMap(state.project.mediaAssets).get(mediaId);
}

/**
 * Resolve media asset yang dipakai sebuah clip.
 * Return `undefined` untuk text clip (tidak punya media).
 */
export function getClipMedia(
  state: AppState,
  clip: Clip,
): MediaAsset | undefined {
  if (clip.source.kind !== "media") return undefined;
  return getMediaById(state, clip.source.mediaId);
}

/* ============================================================
   UTILS — DERIVED
   ------------------------------------------------------------
   Nilai yang dihitung dari beberapa selector. Sering dipakai
   di header/badge.
   ============================================================ */

/** Total durasi semua clip di timeline (sum per track terbesar — bukan sum semua). */
export function getContentDurationSec(state: AppState): number {
  let maxEnd = 0;
  for (const track of state.project.sequence.tracks) {
    for (const clip of track.clips) {
      const end = clip.startSec + clip.durationSec;
      if (end > maxEnd) maxEnd = end;
    }
  }
  return maxEnd;
}

/** Jumlah total clip (semua track). */
export function getTotalClipCount(state: AppState): number {
  let total = 0;
  for (const track of state.project.sequence.tracks) {
    total += track.clips.length;
  }
  return total;
}

/** Jumlah media asset di bin. */
export function getMediaAssetCount(state: AppState): number {
  return state.project.mediaAssets.length;
}

/* ============================================================
   TEST HOOKS — internal
   ------------------------------------------------------------
   Reset cache internal. Berguna untuk unit test yang
   memanggil banyak state berbeda tanpa leak antar test.
   Bukan untuk production.
   ============================================================ */
export function _resetSelectorCache(): void {
  mediaCache = null;
}

/**
 * Durasi maksimum yang boleh dimiliki sebuah clip.
 *
 * - Text clip / tanpa source: hanya dibatasi sisa sequence.
 * - Media clip: min(asset.durationSec, sisa sequence).
 *   Kalau asset.durationSec null (image / probe gagal) → hanya
 *   dibatasi sisa sequence.
 */
export function getMaxClipDuration(state: AppState, clip: Clip): number {
  const MAX = TIMELINE.MAX_SEQUENCE_DURATION_SEC;
  const remaining = MAX - clip.startSec;
  if (remaining <= 0) return 0;

  if (clip.source.kind === "text") return remaining;

  /* Sebelum akses mediaId — */
  if (clip.source.kind !== "media") {
    /* Hanya shape/text/nested (non-media) → tanpa batas asset. */
    const remaining = TIMELINE.MAX_SEQUENCE_DURATION_SEC - clip.startSec;
    return Math.max(0, remaining);
  }

  const asset = getMediaById(state, clip.source.mediaId);
  const assetDur = asset?.durationSec;
  if (assetDur === null || assetDur === undefined) return remaining;
  return Math.min(assetDur, remaining);
}

/**
 * Cari transition by ID di semua track. Return track juga
 * (untuk edit durasi/kind di future).
 */
export function getTransitionById(
  state: AppState,
  transitionId: string,
): { transition: Transition; track: Track } | undefined {
  for (const track of state.project.sequence.tracks) {
    const tr = track.transitions.find((t) => t.id === transitionId);
    if (tr) return { transition: tr, track };
  }
  return undefined;
}

/**
 * Hitung berapa banyak clip yang menggunakan asset(s) tertentu.
 * Return 0 kalau tidak ada.
 */
export function countClipsUsingAssets(
  state: AppState,
  assetIds: readonly string[],
): number {
  if (assetIds.length === 0) return 0;
  const idSet = new Set(assetIds);
  let count = 0;
  for (const track of state.project.sequence.tracks) {
    for (const clip of track.clips) {
      if (clip.source.kind === "media" && idSet.has(clip.source.mediaId)) {
        count++;
      }
    }
  }
  return count;
}
