import { el, on } from "@core/Dom";

/* ============================================================
   REUSABLE INFO DIALOG
   ------------------------------------------------------------
   Modal read-only: title + HTML content + OK button.
   Promise-based; resolve saat user close.
   ============================================================ */

export interface DialogOptions {
  readonly title: string;
  readonly content: string; // HTML string (trusted static, dari developer)
  readonly confirmLabel?: string;
}

export function openDialog(opts: DialogOptions): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;

    const overlay = el("div", { className: "dialog-overlay" });
    const modal = el("div", { className: "dialog-modal" });

    const title = el("div", { className: "dialog-title", text: opts.title });

    const content = el("div", { className: "dialog-content" });
    content.innerHTML = opts.content; // trusted static HTML

    const actions = el("div", { className: "dialog-actions" });
    const okBtn = el("button", {
      className: "btn primary",
      text: opts.confirmLabel ?? "OK",
    });
    okBtn.type = "button";
    actions.append(okBtn);

    modal.append(title, content, actions);
    overlay.append(modal);
    document.body.append(overlay);

    setTimeout(() => okBtn.focus(), 0);

    const cleanups: Array<() => void> = [];

    const finish = (): void => {
      if (settled) return;
      settled = true;
      cleanups.forEach((fn) => fn());
      overlay.remove();
      resolve();
    };

    cleanups.push(on(okBtn, "click", finish));
    cleanups.push(
      on(overlay, "click", (ev) => {
        if (ev.target === overlay) finish();
      }),
    );
    cleanups.push(
      on(document, "keydown", (ev) => {
        if (ev.key === "Escape" || ev.key === "Enter") {
          ev.preventDefault();
          finish();
        }
      }),
    );
  });
}
