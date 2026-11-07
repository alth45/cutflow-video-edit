import type { MediaAsset } from "@shared/types/project";

/* ============================================================
   MEDIA LOGIC — pure functions + static data
   ============================================================ */

/* ---------- Static data: effects & transitions ---------- */

export interface ListEntry {
  readonly name: string;
  readonly sub: string;
  /** Index gradient 1..8 — dipakai untuk `swatch g{N}`. */
  readonly gradientIndex: number;
}

export const TRANSITIONS: readonly ListEntry[] = [
  { name: "Cross Dissolve", sub: "0.5s · default", gradientIndex: 3 },
  { name: "Dip to Black", sub: "0.5s", gradientIndex: 2 },
  { name: "Dip to White", sub: "0.5s", gradientIndex: 6 },
  { name: "Slide (H)", sub: "0.4s · left", gradientIndex: 5 },
  { name: "Slide (V)", sub: "0.4s · down", gradientIndex: 5 },
  { name: "Wipe", sub: "0.5s · right", gradientIndex: 7 },
  { name: "Circle Wipe", sub: "0.6s", gradientIndex: 4 },
  { name: "Barn Doors", sub: "0.5s", gradientIndex: 1 },
  { name: "Zoom Blur", sub: "0.6s", gradientIndex: 1 },
  { name: "Cross Zoom", sub: "0.7s", gradientIndex: 8 },
];

/* ---------- Filter ---------- */

/**
 * Filter media assets berdasarkan `query` (case-insensitive,
 * match against `name`). Empty query = semua asset.
 */
export function filterMediaAssets(
  assets: readonly MediaAsset[],
  query: string,
): readonly MediaAsset[] {
  const q = query.trim().toLowerCase();
  if (!q) return assets;
  return assets.filter((a) => a.name.toLowerCase().includes(q));
}

/* ---------- Presentation helpers ---------- */

/** Hash deterministik dari string → index non-negatif. */
export function hashIndex(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Map index apapun → nama class gradient `g1`..`g8`. */
export function getGradientClass(index: number): string {
  const n = (index % 8) + 1;
  return `g${n}`;
}

/**
 * Format durasi detik → "MM:SS" untuk badge.
 * Return `null` jika durasi tidak diketahui (tidak render badge).
 */
export function formatDurationBadge(seconds: number | null): string | null {
  if (seconds === null || seconds < 0 || !isFinite(seconds)) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/* ============================================================
   F14b+: SECTION HELPERS
   ------------------------------------------------------------
   Filter/split untuk section "Imported" di Effects & Transitions.
   ============================================================ */

/**
 * Filter built-in entries (EFFECTS atau TRANSITIONS) by name/sub
 * substring. Empty query = semua.
 */
export function filterListEntries<T extends ListEntry>(
  entries: readonly T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...entries];
  return entries.filter(
    (e) => e.name.toLowerCase().includes(q) || e.sub.toLowerCase().includes(q),
  );
}

/** Ambil asset bertipe 'image' (untuk Effects panel). */
export function getImageAssets(
  assets: readonly MediaAsset[],
): readonly MediaAsset[] {
  return assets.filter((a) => a.kind === "image");
}

/** Ambil asset bertipe 'video' (untuk Transitions panel). */
export function getVideoAssets(
  assets: readonly MediaAsset[],
): readonly MediaAsset[] {
  return assets.filter((a) => a.kind === "video");
}
