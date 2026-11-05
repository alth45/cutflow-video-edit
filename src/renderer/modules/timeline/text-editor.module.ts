import { el, on } from "@core/Dom";

/* ============================================================
   TEXT EDITOR MODAL
   ------------------------------------------------------------
   Promise-based modal editor. Return `string` (saved) atau
   `null` (cancelled). Overlay fullscreen + centered modal,
   textarea auto-focus & select-all.

   Keyboard:
   - Enter         → save (single-line UX)
   - Shift+Enter   → newline (multi-line support)
   - Escape        → cancel
   - Klik overlay  → cancel
   ============================================================ */

export interface TextEditorOptions {
  readonly initialValue: string;
  readonly title?: string;
  readonly placeholder?: string;
}

export function openTextEditor(
  opts: TextEditorOptions,
): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;

    const overlay = el("div", { className: "text-editor-overlay" });
    const modal = el("div", { className: "text-editor-modal" });

    const title = el("div", {
      className: "text-editor-title",
      text: opts.title ?? "Edit text",
    });

    const input = el("textarea", {
      className: "text-editor-input",
      attrs: {
        rows: "3",
        placeholder: opts.placeholder ?? "Enter text…",
        spellcheck: "false",
      },
    });
    input.value = opts.initialValue;

    const actions = el("div", { className: "text-editor-actions" });
    const cancelBtn = el("button", { className: "btn", text: "Cancel" });
    cancelBtn.type = "button";
    const saveBtn = el("button", { className: "btn primary", text: "Save" });
    saveBtn.type = "button";
    actions.append(cancelBtn, saveBtn);

    modal.append(title, input, actions);
    overlay.append(modal);
    document.body.append(overlay);

    /* Focus + select setelah browser render. */
    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);

    const cleanups: Array<() => void> = [];

    function finish(value: string | null): void {
      if (settled) return;
      settled = true;
      cleanups.forEach((fn) => fn());
      overlay.remove();
      resolve(value);
    }

    cleanups.push(on(cancelBtn, "click", () => finish(null)));
    cleanups.push(on(saveBtn, "click", () => finish(input.value)));

    cleanups.push(
      on(overlay, "click", (ev) => {
        if (ev.target === overlay) finish(null);
      }),
    );

    cleanups.push(
      on(input, "keydown", (ev) => {
        if (ev.key === "Enter" && !ev.shiftKey) {
          ev.preventDefault();
          finish(input.value);
        } else if (ev.key === "Escape") {
          ev.preventDefault();
          finish(null);
        }
      }),
    );
  });
}
