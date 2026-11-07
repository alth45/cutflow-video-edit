import { el, on } from "@core/Dom";

export interface ExportModal {
  readonly updateProgress: (pct: number) => void;
  readonly close: () => void;
}

export function openExportModal(): ExportModal {
  const overlay = el("div", { className: "export-modal-overlay" });
  const modal = el("div", { className: "export-modal" });

  const title = el("div", {
    className: "export-modal-title",
    text: "Exporting Video…",
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
    text: "Keep this window in focus. Audio + video captured in real-time.",
  });

  modal.append(title, progressWrap, progressText, hint);
  overlay.append(modal);
  document.body.append(overlay);

  return {
    updateProgress(pct: number) {
      const rounded = Math.round(pct * 100);
      progressBar.style.width = `${rounded}%`;
      progressText.textContent = `${rounded}%`;
    },
    close() {
      overlay.remove();
    },
  };
}
