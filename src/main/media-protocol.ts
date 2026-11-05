import { protocol, net } from "electron";
import { pathToFileURL } from "node:url";

/* ============================================================
   CUSTOM PROTOCOL: cutflow-media://
   ------------------------------------------------------------
   Serve file lokal ke renderer via URL scheme, sehingga
   `<img src="cutflow-media://...">` dan `<video src="...">`
   bekerja tanpa bypass webSecurity / tanpa data URL (base64).

   Privileges:
   - standard    : URL parse normal (://host/path)
   - secure      : dianggap secure context (mixed-content safe)
   - supportFetchAPI : fetch() dari scheme ini bisa
   - stream      : range requests supported (video seeking)
   ============================================================ */

const SCHEME = "cutflow-media";

export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: false,
      },
    },
  ]);
}

export function registerMediaProtocol(): void {
  protocol.handle(SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      const filePath = url.searchParams.get("path");
      if (!filePath) {
        return new Response("Missing path", { status: 400 });
      }

      /* TODO(F14+): whitelist validation — main tidak tahu
         project.mediaAssets (state di renderer). Untuk v1,
         path datang dari file picker (user-controlled) dan
         sudah divalidasi exists saat import.

         Kalau nanti butuh strict: renderer bisa register path
         via IPC saat import, main simpan Set<string> dan cek
         di sini. */
      return await net.fetch(pathToFileURL(filePath).toString());
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[cutflow:media-protocol] failed:", err);
      return new Response("Not found", { status: 404 });
    }
  });
}
