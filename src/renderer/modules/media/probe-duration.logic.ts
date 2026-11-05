/* ============================================================
   PROBE MEDIA DURATION
   ------------------------------------------------------------
   Baca durasi video/audio tanpa download full file —
   `<video preload="metadata">` cukup untuk `loadedmetadata`.

   Element `<video>` dipakai untuk keduanya (audio juga bisa
   di-handle). Timeout 10s sebagai safety untuk file corrupt.
   ============================================================ */

const PROBE_TIMEOUT_MS = 10_000;

/**
 * Baca durasi dari URL media.
 * Return `null` jika gagal (codec unsupported, timeout, error).
 */
export function probeMediaDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const el = document.createElement("video");
    el.preload = "metadata";
    el.muted = true;

    let settled = false;
    const finish = (result: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("error", onError);
      el.removeAttribute("src");
      el.load();
      resolve(result);
    };

    const onLoaded = (): void => {
      const d = el.duration;
      finish(Number.isFinite(d) && d > 0 ? d : null);
    };
    const onError = (): void => finish(null);

    const timeoutId = window.setTimeout(() => finish(null), PROBE_TIMEOUT_MS);

    el.addEventListener("loadedmetadata", onLoaded, { once: true });
    el.addEventListener("error", onError, { once: true });
    el.src = url;
  });
}
