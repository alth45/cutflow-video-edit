/* ============================================================
   ID GENERATOR
   ------------------------------------------------------------
   Generator ID untuk entitas domain: project, sequence, track,
   clip, media asset.

   Kenapa tidak pakai library `nanoid`/`uuid`:
   - Chromium sudah punya `crypto.randomUUID()` (secure,
     cryptographically random) — Electron 33 = Chromium ~130.
   - Nol dependency tambahan untuk satu fungsi.
   - Format UUID v4 (36 char) sudah cukup untuk project file.

   Kenapa prefix:
   - Debug readability: log `track_550e8400...` langsung tahu entity.
   - Deteksi salah tipe ID saat debugging (clip ID di tempat track).
   - Tidak menggantikan type safety — itu tugas TypeScript. Ini hanya
     bantuan log & observability.
   ============================================================ */

/** Prefix standar per entitas domain. */
export type IdPrefix =
  | "project"
  | "seq" // sequence
  | "track"
  | "clip"
  | "media"
  | "effect"
  | "kf";

/**
 * Hasilkan ID unik dengan format `<prefix>_<uuid-v4>`.
 *
 * Contoh: `track_550e8400-e29b-41d4-a716-446655440000`
 *
 * @throws {Error} Jika `crypto.randomUUID` tidak tersedia (kondisi
 *   tidak mungkin di Chromium modern, tapi fail-fast lebih baik
 *   daripada ID yang diam-diam bukan unik).
 */
export function makeId(prefix: IdPrefix): string {
  const uuid = crypto.randomUUID();
  return `${prefix}_${uuid}`;
}

/**
 * Versi tanpa prefix untuk kasus yang butuh raw UUID
 * (mis. header HTTP request ID di masa depan).
 */
export function makeUuid(): string {
  return crypto.randomUUID();
}
