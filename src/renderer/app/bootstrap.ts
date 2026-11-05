import { createAppShell, type AppShell } from "./App";
import { mountTopbar } from "@modules/topbar/topbar.module";
import { mountMedia } from "@modules/media/media.module";
import { mountPreview } from "@modules/preview/preview.module";
import { mountInspector } from "@modules/inspector/inspector.module";
import { mountTimeline } from "@modules/timeline/timeline.module";
import { mountKeyboard } from "@modules/keyboard/keyboard.module";
import { mountToast } from "@modules/toast/toast.module";
import { seedDemoMedia, seedDemoClips } from "@state/demo";

let shell: AppShell | null = null;
const cleanups: Array<() => void> = [];

export function bootstrap(): void {
  if (shell) return;

  /* Toast mounted first — capture errors from subsequent mounts. */
  cleanups.push(mountToast(document.body));

  if (!window.cutflow.app.isPackaged) {
    seedDemoMedia();
    // seedDemoClips();
  }

  shell = createAppShell();

  cleanups.push(mountTopbar(shell.mounts.topbar));
  cleanups.push(mountMedia(shell.mounts.media));
  cleanups.push(mountPreview(shell.mounts.preview));
  cleanups.push(mountInspector(shell.mounts.inspector));
  cleanups.push(mountTimeline(shell.mounts.timeline));
  cleanups.push(mountKeyboard());

  if (!window.cutflow.app.isPackaged) {
    // eslint-disable-next-line no-console
    console.info("[bootstrap] App shell ready");
  }
}

export function unmountApp(): void {
  cleanups.forEach((fn) => fn());
  cleanups.length = 0;
  if (shell) {
    shell.root.remove();
    shell = null;
  }
}
