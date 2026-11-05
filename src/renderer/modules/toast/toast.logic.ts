import type { IconName } from "@core/icons";
import type { ToastTone } from "@core/events";

/* ============================================================
   TOAST LOGIC
   ============================================================ */

export interface ToastItem {
  readonly id: string;
  readonly message: string;
  readonly tone: ToastTone;
  readonly icon: IconName;
  readonly durationMs: number;
}

const DEFAULT_DURATION_MS = 4000;
const MIN_DURATION_MS = 1000;
const MAX_DURATION_MS = 15000;

let seq = 0;

export function makeToastId(): string {
  seq += 1;
  return `toast-${seq}-${Date.now()}`;
}

export function normalizeDuration(ms: number | undefined): number {
  if (ms === undefined) return DEFAULT_DURATION_MS;
  return Math.max(MIN_DURATION_MS, Math.min(MAX_DURATION_MS, ms));
}

export function toneIcon(tone: ToastTone): IconName {
  switch (tone) {
    case "info":
      return "info";
    case "success":
      return "check";
    case "warning":
      return "alert";
    case "error":
      return "x";
  }
}
