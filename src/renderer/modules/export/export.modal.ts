import { el } from "@core/Dom";

export interface ExportModal {
  readonly update: (progress: number, phase: string, detail?: string) => void;
  readonly close: () => void;
}

export function openExportModal(): ExportModal {
  const overlay = el("div", { className: "export-modal-overlay" });
  const modal = el("div", { className: "export-modal" });

  const title = el("div", {
    className: "export-modal-title",
    text: "Exporting Video…",
  });
  const phaseEl = el("div", {
    className: "export-modal-phase",
    text: "Preparing…",
  });

  const progressWrap = el("div", { className: "export-progress-wrap" });
  const progressBar = el("div", { className: "export-progress-bar" });
  progressWrap.append(progressBar);
  const progressText = el("div", {
    className: "export-progress-text",
    text: "0%",
  });

  const hint = el("div", {
    className: "export-modal-hint",
    text: "Frame-accurate render. Duration depends on timeline length.",
  });

  modal.append(title, phaseEl, progressWrap, progressText, hint);
  overlay.append(modal);
  document.body.append(overlay);

  return {
    update(progress, phase, detail) {
      const pct = Math.round(progress * 100);
      progressBar.style.width = `${pct}%`;
      progressText.textContent = detail ?? `${pct}%`;
      phaseEl.textContent = phase;
    },
    close() {
      overlay.remove();
    },
  };
}
