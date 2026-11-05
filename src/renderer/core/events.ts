import { EventBus } from "./EventBus";

/* ============================================================
   GLOBAL EVENT BUS
   ------------------------------------------------------------
   Event ephemeral yang bukan state — tidak perlu disimpan,
   tidak perlu di-query ulang, hanya "sesuatu terjadi".

   Contoh pakai: toast, focus-request, close-menu, dsb.
   ============================================================ */

export type ToastTone = "info" | "success" | "warning" | "error";

export interface ToastShowPayload {
  readonly message: string;
  readonly tone?: ToastTone;
  /** Default 4000ms, clamp [1000, 15000]. */
  readonly durationMs?: number;
}

export interface CutFlowEvents {
  "toast:show": ToastShowPayload;
}

export const eventBus = new EventBus<CutFlowEvents>();
