import { el, on } from "@core/Dom";
import { TIMELINE } from "@shared/constants";
import type { Sequence } from "@shared/types/project";

/* ============================================================
   SEQUENCE SETTINGS MODAL
   ------------------------------------------------------------
   Promise-based. Returns updates object or null (cancelled).
   Caller (topbar) applies via `actions.updateSequenceSettings`
   and handles ok/error via returned result.

   Modal only validates basic shape/type. Full validation
   (content-end check) handled by action for defense-in-depth.
   ============================================================ */

export interface SequenceSettingsUpdates {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly durationSec: number;
}

export interface SequenceSettingsOptions {
  readonly sequence: Sequence;
  readonly contentEndSec: number;
}

const FPS_PRESETS = [24, 25, 30, 60];

const RES_PRESETS: ReadonlyArray<{ w: number; h: number; label: string }> = [
  { w: 1920, h: 1080, label: "1920×1080 (FHD)" },
  { w: 1280, h: 720, label: "1280×720 (HD)" },
  { w: 3840, h: 2160, label: "3840×2160 (4K)" },
  { w: 1080, h: 1920, label: "1080×1920 (Vertical)" },
  { w: 1080, h: 1080, label: "1080×1080 (Square)" },
];

export function openSequenceSettings(
  opts: SequenceSettingsOptions,
): Promise<SequenceSettingsUpdates | null> {
  return new Promise((resolve) => {
    let settled = false;

    const overlay = el("div", { className: "dialog-overlay" });
    const modal = el("div", { className: "dialog-modal seq-settings-modal" });

    const title = el("div", {
      className: "dialog-title",
      text: "Sequence Settings",
    });

    /* ---- Form body ---- */
    const body = el("div", { className: "seq-settings-body" });

    /* Name */
    const nameRow = el("div", { className: "seq-settings-row" });
    const nameLabel = el("label", { text: "Name" });
    const nameInput = el("input", {
      attrs: { type: "text" },
    }) as HTMLInputElement;
    nameInput.value = opts.sequence.name;
    nameInput.spellcheck = false;
    nameRow.append(nameLabel, nameInput);
    body.append(nameRow);

    /* Resolution */
    const resRow = el("div", {
      className: "seq-settings-row seq-settings-row-stacked",
    });
    const resLabel = el("label", { text: "Resolution" });
    const resInputs = el("div", { className: "seq-settings-res-inputs" });

    const widthInput = el("input", {
      attrs: { type: "number", min: "16", max: "7680", step: "2" },
    }) as HTMLInputElement;
    widthInput.value = String(opts.sequence.width);

    const times = el("span", { className: "seq-settings-res-x", text: "×" });

    const heightInput = el("input", {
      attrs: { type: "number", min: "16", max: "4320", step: "2" },
    }) as HTMLInputElement;
    heightInput.value = String(opts.sequence.height);

    resInputs.append(widthInput, times, heightInput);
    resRow.append(resLabel, resInputs);

    /* Preset buttons for resolution */
    const resPresets = el("div", { className: "seq-settings-presets" });
    const presetBtns: HTMLButtonElement[] = [];
    for (const preset of RES_PRESETS) {
      const btn = el("button", {
        className: "seq-settings-preset-btn",
        text: preset.label,
        attrs: { type: "button" },
      }) as HTMLButtonElement;
      btn.dataset["w"] = String(preset.w);
      btn.dataset["h"] = String(preset.h);
      presetBtns.push(btn);
      resPresets.append(btn);
    }
    resRow.append(resPresets);
    body.append(resRow);

    /* FPS */
    const fpsRow = el("div", { className: "seq-settings-row" });
    const fpsLabel = el("label", { text: "Frame rate" });
    const fpsSegmented = el("div", { className: "seq-settings-segmented" });
    const fpsBtns: HTMLButtonElement[] = [];
    for (const fps of FPS_PRESETS) {
      const btn = el("button", {
        className: `seq-settings-seg-btn${fps === opts.sequence.fps ? " active" : ""}`,
        text: String(fps),
        attrs: { type: "button" },
      }) as HTMLButtonElement;
      btn.dataset["fps"] = String(fps);
      fpsBtns.push(btn);
      fpsSegmented.append(btn);
    }
    const customFpsWrap = el("span", { className: "seq-settings-custom-fps" });
    const fpsInput = el("input", {
      attrs: { type: "number", min: "1", max: "120", step: "0.001" },
    }) as HTMLInputElement;
    fpsInput.value = String(opts.sequence.fps);
    customFpsWrap.append(fpsInput, el("span", { text: "fps" }));
    fpsRow.append(fpsLabel, fpsSegmented, customFpsWrap);
    body.append(fpsRow);

    /* Duration */
    const durRow = el("div", { className: "seq-settings-row" });
    const durLabel = el("label", { text: "Duration" });
    const durInput = el("input", {
      attrs: {
        type: "number",
        min: String(TIMELINE.MIN_SEQUENCE_DURATION_SEC),
        max: String(TIMELINE.MAX_SEQUENCE_DURATION_SEC),
        step: "0.1",
      },
    }) as HTMLInputElement;
    durInput.value = String(opts.sequence.durationSec);
    const durHint = el("span", {
      className: "seq-settings-hint",
      text: `Content: ${opts.contentEndSec > 0 ? opts.contentEndSec.toFixed(1) + "s" : "empty"}`,
    });
    durRow.append(durLabel, durInput, durHint);
    body.append(durRow);

    /* Error display */
    const errorEl = el("div", { className: "seq-settings-error" });
    errorEl.hidden = true;

    /* Actions */
    const actions = el("div", { className: "dialog-actions" });
    const cancelBtn = el("button", { className: "btn", text: "Cancel" });
    cancelBtn.type = "button";
    const saveBtn = el("button", { className: "btn primary", text: "Save" });
    saveBtn.type = "button";
    actions.append(cancelBtn, saveBtn);

    modal.append(title, body, errorEl, actions);
    overlay.append(modal);
    document.body.append(overlay);

    setTimeout(() => nameInput.focus(), 0);

    /* ---- Interactions ---- */

    function setFps(value: number): void {
      fpsInput.value = String(value);
      fpsBtns.forEach((b) => {
        b.classList.toggle("active", Number(b.dataset["fps"]) === value);
      });
    }

    function setResolution(w: number, h: number): void {
      widthInput.value = String(w);
      heightInput.value = String(h);
    }

    const cleanups: Array<() => void> = [];

    for (const btn of presetBtns) {
      cleanups.push(
        on(btn, "click", () => {
          setResolution(Number(btn.dataset["w"]), Number(btn.dataset["h"]));
        }),
      );
    }

    for (const btn of fpsBtns) {
      cleanups.push(on(btn, "click", () => setFps(Number(btn.dataset["fps"]))));
    }

    cleanups.push(
      on(fpsInput, "input", () => {
        const v = Number(fpsInput.value);
        fpsBtns.forEach((b) => {
          b.classList.toggle("active", Number(b.dataset["fps"]) === v);
        });
      }),
    );

    function finish(result: SequenceSettingsUpdates | null): void {
      if (settled) return;
      settled = true;
      cleanups.forEach((fn) => fn());
      overlay.remove();
      resolve(result);
    }

    cleanups.push(on(cancelBtn, "click", () => finish(null)));

    cleanups.push(
      on(overlay, "click", (ev) => {
        if (ev.target === overlay) finish(null);
      }),
    );

    cleanups.push(
      on(document, "keydown", (ev) => {
        if (ev.key === "Escape") {
          ev.preventDefault();
          finish(null);
        } else if (
          ev.key === "Enter" &&
          ev.target instanceof HTMLInputElement
        ) {
          ev.preventDefault();
          saveBtn.click();
        }
      }),
    );

    cleanups.push(
      on(saveBtn, "click", () => {
        const name = nameInput.value.trim();
        const width = Math.round(Number(widthInput.value));
        const height = Math.round(Number(heightInput.value));
        const fps = Number(fpsInput.value);
        const durationSec = Number(durInput.value);

        /* Basic validation (action re-validates). */
        if (!name) {
          errorEl.textContent = "Name cannot be empty";
          errorEl.hidden = false;
          return;
        }
        if (!Number.isInteger(width) || width < 16 || width > 7680) {
          errorEl.textContent = "Width must be between 16 and 7680";
          errorEl.hidden = false;
          return;
        }
        if (!Number.isInteger(height) || height < 16 || height > 4320) {
          errorEl.textContent = "Height must be between 16 and 4320";
          errorEl.hidden = false;
          return;
        }
        if (!Number.isFinite(fps) || fps < 1 || fps > 120) {
          errorEl.textContent = "Frame rate must be between 1 and 120";
          errorEl.hidden = false;
          return;
        }
        if (
          !Number.isFinite(durationSec) ||
          durationSec < TIMELINE.MIN_SEQUENCE_DURATION_SEC ||
          durationSec > TIMELINE.MAX_SEQUENCE_DURATION_SEC
        ) {
          errorEl.textContent = `Duration must be between ${TIMELINE.MIN_SEQUENCE_DURATION_SEC}s and ${TIMELINE.MAX_SEQUENCE_DURATION_SEC}s`;
          errorEl.hidden = false;
          return;
        }

        errorEl.hidden = true;
        finish({ name, width, height, fps, durationSec });
      }),
    );
  });
}
