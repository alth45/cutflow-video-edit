/* ============================================================
   PLAYBACK LOGIC — pure functions
   ------------------------------------------------------------
   Fungsi murni untuk timecode formatting, clamping, dan
   advance time. Tidak ada DOM, tidak ada state, tidak ada
   side-effects.
   ============================================================ */

/**
 * Format detik → timecode `HH:MM:SS:FF`.
 *
 * `FF` = frame dalam detik tersebut (0..fps-1), sesuai fps
 * sequence. Untuk fps integer (24, 30, 60) → frame konsisten.
 * Untuk fps float (29.97) → floor tetap menghasilkan frame
 * valid (frame 0..29).
 */
export function formatTimecode(seconds: number, fps: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  if (!isFinite(fps) || fps <= 0) fps = 30;

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * fps);

  return [h, m, s, f].map((n) => String(n).padStart(2, "0")).join(":");
}

/**
 * Format durasi singkat `M:SS` — untuk label ringkas.
 */
export function formatDurationShort(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Clamp detik ke rentang [0, duration]. Defensif — caller
 * harus sudah clamp di action, tapi helper ini berguna untuk
 * pure test & preview display logic.
 */
export function clampTime(seconds: number, duration: number): number {
  return Math.min(duration, Math.max(0, seconds));
}
