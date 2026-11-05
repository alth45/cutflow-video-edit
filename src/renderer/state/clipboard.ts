import type { Clip, TrackKind } from "@shared/types/timeline";

/* ============================================================
   CLIPBOARD — module-level storage
   ------------------------------------------------------------
   Internal clipboard (bukan OS clipboard). Ephemeral: hilang
   saat app restart.

   `relativeStartSec`: posisi relatif terhadap clip TERAWAL di
   clipboard. Saat paste, masing-masing clip mulai dari
   `playhead + relativeStartSec` — preserves timing antar clip
   (kalau copy 2 clip yang overlap, hasilnya overlap sama).
   ============================================================ */

export interface ClipboardEntry {
  readonly clip: Clip;
  readonly trackKind: TrackKind;
  readonly sourceTrackId: string;
  readonly relativeStartSec: number;
}

let entries: readonly ClipboardEntry[] = [];

export function setClipboard(next: readonly ClipboardEntry[]): void {
  entries = next;
}

export function getClipboard(): readonly ClipboardEntry[] {
  return entries;
}

export function hasClipboard(): boolean {
  return entries.length > 0;
}

export function clearClipboard(): void {
  entries = [];
}
