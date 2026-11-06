import type { Project } from "@shared/types/project";
import { PROJECT_SCHEMA_VERSION } from "@shared/types/project";
import {
  DEFAULT_CLIP_TRANSFORM,
  DEFAULT_CLIP_COLOR,
  DEFAULT_CLIP_AUDIO,
  DEFAULT_TEXT_STYLE,
} from "@shared/types/timeline";

/* ============================================================
   PROJECT SERIALIZER
   ------------------------------------------------------------
   Serialize/parse project ke/dari JSON string.

   Main process hanya simpan string — parse dan validasi di sini
   (renderer). Ini menjaga main tetap "dumb" dan memungkinkan
   renderer menampilkan error yang spesifik ke user.
   ============================================================ */

export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2);
}

export type ParseProjectResult =
  | { readonly ok: true; readonly project: Project }
  | { readonly ok: false; readonly error: string };

export function parseProject(json: string): ParseProjectResult {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Invalid JSON: ${message}` };
  }

  if (!data || typeof data !== "object") {
    return { ok: false, error: "Root is not an object" };
  }

  const p = data as Record<string, unknown>;

  if (p["schemaVersion"] !== PROJECT_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Schema version mismatch: got "${String(p["schemaVersion"])}", expected "${PROJECT_SCHEMA_VERSION}"`,
    };
  }
  if (typeof p["id"] !== "string" || !p["id"]) {
    return { ok: false, error: "Missing or invalid project.id" };
  }
  if (typeof p["name"] !== "string") {
    return { ok: false, error: "Missing project.name" };
  }
  if (
    typeof p["createdAt"] !== "number" ||
    typeof p["updatedAt"] !== "number"
  ) {
    return { ok: false, error: "Missing createdAt/updatedAt" };
  }

  const seq = p["sequence"];
  if (!seq || typeof seq !== "object") {
    return { ok: false, error: "Missing project.sequence" };
  }
  const s = seq as Record<string, unknown>;
  for (const key of ["id", "name"] as const) {
    if (typeof s[key] !== "string") {
      return { ok: false, error: `Missing sequence.${key}` };
    }
  }
  for (const key of ["width", "height", "fps", "durationSec"] as const) {
    if (typeof s[key] !== "number") {
      return { ok: false, error: `Missing sequence.${key}` };
    }
  }
  if (!Array.isArray(s["tracks"])) {
    return { ok: false, error: "Missing sequence.tracks" };
  }
  if (!Array.isArray(p["mediaAssets"])) {
    return { ok: false, error: "Missing project.mediaAssets" };
  }

  /* Backward compat: file lama mungkin belum punya `transitions`
     di setiap track. Normalize ke array kosong. */
  const normalizedTracks = (s["tracks"] as unknown[]).map((t) => {
    if (!t || typeof t !== "object") return t;
    const track = t as Record<string, unknown>;

    const transitions = Array.isArray(track["transitions"])
      ? track["transitions"]
      : [];

    const clipsRaw = track["clips"];

    const clips = Array.isArray(clipsRaw)
      ? clipsRaw.map((c) => {
          if (!c || typeof c !== "object") return c;
          const clip = c as Record<string, unknown>;
          const patched: Record<string, unknown> = { ...clip };
          if (!patched["transform"])
            patched["transform"] = DEFAULT_CLIP_TRANSFORM;
          if (!patched["color"]) patched["color"] = DEFAULT_CLIP_COLOR;
          if (!patched["audio"]) patched["audio"] = DEFAULT_CLIP_AUDIO;
          if (!patched["effects"]) patched["effects"] = [];

          /* Text clip backward compat: normalize missing style. */
          const source = patched["source"];
          if (
            source &&
            typeof source === "object" &&
            (source as Record<string, unknown>)["kind"] === "text"
          ) {
            const src = source as Record<string, unknown>;
            if (!src["style"]) {
              patched["source"] = { ...src, style: DEFAULT_TEXT_STYLE };
            }
          }

          return patched;
        })
      : clipsRaw;

    return { ...track, clips, transitions };
  });
  s["tracks"] = normalizedTracks;

  // Track & clip validation exhaustive — dilewati untuk v1. Kalau
  // nanti bikin project rusak karena field hilang, tambahkan di sini.

  return { ok: true, project: data as Project };
}
