import { el } from "@core/Dom";
import { createIcon } from "@core/icons";
import type { ToastItem } from "./toast.logic";

/* ============================================================
   TOAST VIEW
   ------------------------------------------------------------
   Fokus: konstruksi DOM per-item. Tidak tahu animasi/dismiss
   logic — itu tanggung jawab module (imperative).
   ============================================================ */

export function renderToastItem(toast: ToastItem): HTMLElement {
  const t = el("div", { className: `toast toast-${toast.tone}` });
  t.dataset["toastId"] = toast.id;
  t.setAttribute("role", "alert");
  t.setAttribute("aria-live", "polite");

  const icon = createIcon(toast.icon);
  icon.setAttribute("aria-hidden", "true");

  const message = el("div", {
    className: "toast-message",
    text: toast.message,
  });

  t.append(icon, message);
  return t;
}
