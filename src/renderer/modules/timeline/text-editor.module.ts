import { el, on } from "@core/Dom";
import { createIcon } from "@core/icons";
import { createDropdown, type DropdownItem } from "@core/dropdown";
import { type TextClipStyle } from "@shared/types/timeline";

/* ============================================================
   TEXT EDITOR MODAL (F14z)
   ------------------------------------------------------------
   Modal: textarea + font dropdown + toolbar (B/I/U/Stroke/Outline
   only) + stroke width slider (conditional). Live preview via
   inline style pada textarea sendiri.
   ============================================================ */

export interface TextEditorOptions {
  readonly initialValue: string;
  readonly initialStyle: TextClipStyle;
  readonly title?: string;
  readonly placeholder?: string;
}

export interface TextEditorResult {
  readonly content: string;
  readonly style: TextClipStyle;
}

const FONTS: readonly DropdownItem[] = [
  {
    value: "Inter, system-ui, sans-serif",
    label: "Inter (default)",
    style: "font-family: Inter, system-ui, sans-serif",
  },
  {
    value: "system-ui, -apple-system, sans-serif",
    label: "System UI",
    style: "font-family: system-ui, -apple-system, sans-serif",
  },
  {
    value: "Georgia, serif",
    label: "Georgia (serif)",
    style: "font-family: Georgia, serif",
  },
  {
    value: '"Times New Roman", serif',
    label: "Times (serif)",
    style: 'font-family: "Times New Roman", serif',
  },
  {
    value: "Arial, sans-serif",
    label: "Arial (sans)",
    style: "font-family: Arial, sans-serif",
  },
  {
    value: '"Courier New", monospace',
    label: "Courier (mono)",
    style: 'font-family: "Courier New", monospace',
  },
  {
    value: 'Impact, "Arial Black", sans-serif',
    label: "Impact (display)",
    style: 'font-family: Impact, "Arial Black", sans-serif',
  },
  {
    value: "Verdana, sans-serif",
    label: "Verdana",
    style: "font-family: Verdana, sans-serif",
  },
];

export function openTextEditor(
  opts: TextEditorOptions,
): Promise<TextEditorResult | null> {
  return new Promise((resolve) => {
    let settled = false;
    let style: TextClipStyle = { ...opts.initialStyle };

    const overlay = el("div", { className: "text-editor-overlay" });
    const modal = el("div", { className: "text-editor-modal" });

    const title = el("div", {
      className: "text-editor-title",
      text: opts.title ?? "Edit text",
    });

    /* ---------- Textarea ---------- */
    const input = el("textarea", {
      className: "text-editor-input",
      attrs: {
        rows: "3",
        placeholder: opts.placeholder ?? "Enter text…",
        spellcheck: "false",
      },
    });
    input.value = opts.initialValue;

    /* ---------- Font dropdown ---------- */
    const fontRow = el("div", { className: "text-editor-font-row" });
    const fontDropdown = createDropdown({
      items: FONTS,
      value: style.fontFamily,
      onChange: (v) => {
        style = { ...style, fontFamily: v };
        applyStyleToTextarea();
      },
    });
    fontRow.append(fontDropdown.element);

    /* ---------- Style toolbar ---------- */
    const toolbar = el("div", { className: "text-editor-toolbar" });

    const boldBtn = iconToggle("bold", "Bold", style.fontWeight === 700, () => {
      style = { ...style, fontWeight: style.fontWeight === 700 ? 400 : 700 };
      applyStyleToTextarea();
      refreshButtons();
    });

    const italicBtn = iconToggle(
      "italic",
      "Italic",
      style.fontStyle === "italic",
      () => {
        style = {
          ...style,
          fontStyle: style.fontStyle === "italic" ? "normal" : "italic",
        };
        applyStyleToTextarea();
        refreshButtons();
      },
    );

    const underlineBtn = iconToggle(
      "underline",
      "Underline",
      style.underline,
      () => {
        style = { ...style, underline: !style.underline };
        applyStyleToTextarea();
        refreshButtons();
      },
    );

    const strokeBtn = iconToggle(
      "stroke",
      "Add stroke (outline text)",
      style.stroke,
      () => {
        style = { ...style, stroke: !style.stroke };
        if (!style.stroke) style = { ...style, outlineOnly: false };
        applyStyleToTextarea();
        refreshButtons();
        strokeRow.hidden = !style.stroke;
      },
    );

    const outlineBtn = iconToggle(
      "outline",
      "Outline only (no fill)",
      style.outlineOnly,
      () => {
        if (!style.stroke) return;
        style = { ...style, outlineOnly: !style.outlineOnly };
        applyStyleToTextarea();
        refreshButtons();
      },
    );

    toolbar.append(
      boldBtn,
      italicBtn,
      underlineBtn,
      el("span", { className: "divider" }),
      strokeBtn,
      outlineBtn,
    );

    /* ---------- Stroke width slider ---------- */
    const strokeRow = el("div", { className: "text-editor-stroke-row" });
    const strokeLabel = el("label", { text: "Stroke Width" });
    const strokeInput = el("input", {
      attrs: {
        type: "range",
        min: "0.5",
        max: "6",
        step: "0.5",
        value: String(style.strokeWidth),
      },
    });
    const strokeValue = el("span", {
      className: "val",
      text: `${style.strokeWidth}px`,
    });
    strokeRow.append(strokeLabel, strokeInput, strokeValue);
    strokeRow.hidden = !style.stroke;

    strokeInput.addEventListener("input", () => {
      const v = Number(strokeInput.value);
      style = { ...style, strokeWidth: v };
      strokeValue.textContent = `${v}px`;
      paintRange(strokeInput);
      applyStyleToTextarea();
    });
    paintRange(strokeInput);

    /* ---------- Actions ---------- */
    const actions = el("div", { className: "text-editor-actions" });
    const cancelBtn = el("button", { className: "btn", text: "Cancel" });
    cancelBtn.type = "button";
    const saveBtn = el("button", { className: "btn primary", text: "Save" });
    saveBtn.type = "button";
    actions.append(cancelBtn, saveBtn);

    modal.append(title, input, fontRow, toolbar, strokeRow, actions);
    overlay.append(modal);
    document.body.append(overlay);

    /* ---------- Initial style ---------- */
    applyStyleToTextarea();
    refreshButtons();

    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);

    const cleanups: Array<() => void> = [];

    function finish(value: TextEditorResult | null): void {
      if (settled) return;
      settled = true;
      cleanups.forEach((fn) => fn());
      overlay.remove();
      resolve(value);
    }

    cleanups.push(on(cancelBtn, "click", () => finish(null)));
    cleanups.push(
      on(saveBtn, "click", () => finish({ content: input.value, style })),
    );
    cleanups.push(
      on(overlay, "click", (ev) => {
        if (ev.target === overlay) finish(null);
      }),
    );
    cleanups.push(
      on(input, "keydown", (ev) => {
        if (ev.key === "Enter" && !ev.shiftKey) {
          ev.preventDefault();
          finish({ content: input.value, style });
        } else if (ev.key === "Escape") {
          ev.preventDefault();
          finish(null);
        }
      }),
    );

    /* ---------- Helpers ---------- */
    function iconToggle(
      iconName: "bold" | "italic" | "underline" | "stroke" | "outline",
      title: string,
      isActive: boolean,
      onClick: () => void,
    ): HTMLButtonElement {
      const btn = el("button", {
        className: `text-editor-btn${isActive ? " active" : ""}`,
        attrs: { type: "button", title },
      });
      btn.dataset["toggle"] = iconName;
      btn.append(createIcon(iconName));
      on(btn, "click", (ev) => {
        ev.stopPropagation();
        onClick();
      });
      return btn;
    }

    function refreshButtons(): void {
      const map: Record<string, boolean> = {
        bold: style.fontWeight === 700,
        italic: style.fontStyle === "italic",
        underline: style.underline,
        stroke: style.stroke,
        outline: style.outlineOnly,
      };
      toolbar
        .querySelectorAll<HTMLButtonElement>(".text-editor-btn")
        .forEach((b) => {
          const t = b.dataset["toggle"];
          if (t && t in map) b.classList.toggle("active", map[t] ?? false);
        });
      /* Disable outline toggle kalau stroke off */
      const outlineEl = toolbar.querySelector<HTMLButtonElement>(
        '[data-toggle="outline"]',
      );
      if (outlineEl) outlineEl.disabled = !style.stroke;
    }

    function applyStyleToTextarea(): void {
      input.style.fontFamily = style.fontFamily;
      input.style.fontWeight = String(style.fontWeight);
      input.style.fontStyle = style.fontStyle;
      input.style.textDecoration = style.underline ? "underline" : "none";

      if (style.stroke) {
        input.style.setProperty(
          "-webkit-text-stroke",
          `${style.strokeWidth}px rgba(255, 255, 255, 0.9)`,
        );
        if (style.outlineOnly) {
          input.style.setProperty("-webkit-text-fill-color", "transparent");
          input.style.color = "transparent";
        } else {
          input.style.setProperty("-webkit-text-fill-color", "");
          input.style.color = "var(--text)";
        }
      } else {
        input.style.setProperty("-webkit-text-stroke", "");
        input.style.setProperty("-webkit-text-fill-color", "");
        input.style.color = "var(--text)";
      }
    }

    function paintRange(range: HTMLInputElement): void {
      const min = parseFloat(range.min) || 0;
      const max = parseFloat(range.max) || 100;
      const v = parseFloat(range.value);
      const pct = ((v - min) / (max - min)) * 100;
      range.style.setProperty("--val", `${pct}%`);
    }
  });
}
