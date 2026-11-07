/* ============================================================
   PROBE MEDIA DURATION
   ------------------------------------------------------------
   Baca durasi file. `<audio>` untuk audio (better metadata
   handling), `<video>` untuk video.

   Audio MP3 (VBR) sering report `Infinity` saat loadedmetadata.
   Hack: seek ke `MAX_SAFE_INTEGER` → Chromium paksa hitung
   durasi → `durationchange` fire dengan nilai final.
   ============================================================ */

const PROBE_TIMEOUT_MS = 10_000;

export function probeMediaDuration(
  url: string,
  kind: "video" | "audio",
): Promise<number | null> {
  return new Promise((resolve) => {
    const el = document.createElement(kind === "audio" ? "audio" : "video");
    el.preload = "metadata";
    if (el instanceof HTMLVideoElement) el.muted = true;

    let settled = false;
    const finish = (result: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("durationchange", onDurationChange);
      el.removeEventListener("error", onError);
      el.removeAttribute("src");
      el.load();
      resolve(result);
    };

    const onLoaded = (): void => {
      if (el.duration === Infinity) {
        /* Force duration calculation by seeking far ahead. */
        el.currentTime = Number.MAX_SAFE_INTEGER;
      } else {
        finish(
          Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null,
        );
      }
    };

    const onDurationChange = (): void => {
      /* Fires after the Infinity seek hack completes. */
      if (Number.isFinite(el.duration) && el.duration > 0) {
        el.currentTime = 0;
        finish(el.duration);
      }
    };

    const onError = (): void => finish(null);

    const timeoutId = window.setTimeout(() => finish(null), PROBE_TIMEOUT_MS);

    el.addEventListener("loadedmetadata", onLoaded, { once: true });
    el.addEventListener("durationchange", onDurationChange);
    el.addEventListener("error", onError, { once: true });

    el.src = url;
  });
}
