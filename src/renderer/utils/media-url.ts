/* ============================================================
   MEDIA URL HELPER
   ------------------------------------------------------------
   Bikin URL untuk `<img>` / `<video>` src yang akan di-serve
   oleh custom protocol main (F14b++).
   ============================================================ */

/**
 * Build URL `cutflow-media://local/?path=<encoded>`.
 * Pakai query param (bukan path segment) supaya aman untuk
 * Windows path dengan backslash, colon, dan spasi.
 */
export function mediaUrl(filePath: string): string {
  return `cutflow-media://local/?path=${encodeURIComponent(filePath)}`;
}

/**
 * Deteksi path demo (asset dev-seed yang tidak punya file fisik).
 * Asset demo pakai path `/demo/name.ext` — bukan path filesystem
 * asli. Untuk asset ini kita tetap pakai gradient placeholder.
 */
export function isDemoPath(filePath: string): boolean {
  return filePath.startsWith("/demo/");
}
