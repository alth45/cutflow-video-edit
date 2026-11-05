import { el, on } from "@core/Dom";
import { eventBus } from "@core/events";
import { renderToastItem } from "./toast.view";
import {
  makeToastId,
  normalizeDuration,
  toneIcon,
  type ToastItem,
} from "./toast.logic";

/* ============================================================
   TOAST MODULE — ENTRY
   ------------------------------------------------------------
   Imperative DOM management (bukan re-render) karena:
   - Butuh animasi enter/exit per-item.
   - Items independent — tidak saling replace.

   Lifecycle:
   - Subscribe `toast:show` → spawn item + timer.
   - Timer fire → tambah class `.dismissing` → hapus DOM setelah 200ms.
   - Klik item → dismiss manual.
   - Unmount → cleanup semua timer + container.
   ============================================================ */

const DISMISS_ANIM_MS = 200;
const MAX_VISIBLE = 5;

export function mountToast(container: HTMLElement): () => void {
  const root = el("div", { className: "toast-container" });
  container.append(root);

  const timers = new Map<string, number>();

  function removeToast(domEl: HTMLElement, id: string): void {
    const timer = timers.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.delete(id);
    }

    domEl.classList.add("dismissing");
    window.setTimeout(() => domEl.remove(), DISMISS_ANIM_MS);
  }

  function showToast(toast: ToastItem): void {
    const domEl = renderToastItem(toast);
    root.append(domEl);

    /* Cap maximum visible — hapus terlama kalau overflow. */
    while (root.children.length > MAX_VISIBLE) {
      const first = root.firstElementChild as HTMLElement | null;
      if (!first) break;
      const id = first.dataset["toastId"];
      if (!id) {
        first.remove();
        break;
      }
      removeToast(first, id);
    }

    const timer = window.setTimeout(
      () => removeToast(domEl, toast.id),
      toast.durationMs,
    );
    timers.set(toast.id, timer);
  }

  /* Subscribe to event bus */
  const offShow = eventBus.on("toast:show", (payload) => {
    const tone = payload.tone ?? "info";
    showToast({
      id: makeToastId(),
      message: payload.message,
      tone,
      icon: toneIcon(tone),
      durationMs: normalizeDuration(payload.durationMs),
    });
  });

  /* Click-to-dismiss via delegation */
  const offClick = on(root, "click", (ev) => {
    const target = ev.target;
    if (!(target instanceof Element)) return;
    const toastEl = target.closest<HTMLElement>(".toast");
    if (!toastEl) return;
    const id = toastEl.dataset["toastId"];
    if (id) removeToast(toastEl, id);
  });

  return () => {
    offShow();
    offClick();
    timers.forEach((timer) => window.clearTimeout(timer));
    timers.clear();
    root.remove();
  };
}
