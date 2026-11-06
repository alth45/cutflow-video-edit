import { getIpc, invokeOk } from "@core/IpcClient";
import { eventBus } from "@core/events";
import * as actions from "@state/actions";
import { appStore } from "@state/appStore";
import { serializeProject, parseProject } from "@state/project-serializer";
import { makeId } from "@utils/id";
import type { MediaAsset, MediaAssetKind } from "@shared/types/project";
import { probeMediaDuration } from "@modules/media/probe-duration.logic";
import { mediaUrl, isDemoPath } from "@utils/media-url";
import { countClipsUsingAssets } from "@state/selectors";
/* ---------- helpers ---------- */

function toast(
  message: string,
  tone: "info" | "success" | "warning" | "error",
): void {
  eventBus.emit("toast:show", { message, tone });
}

/* ---------- SAVE ---------- */

export async function saveProjectFlow(): Promise<void> {
  const project = appStore.getState().project;
  const json = serializeProject(project);

  const res = await invokeOk(
    getIpc().project.save(json),
    (msg) => toast(`Save failed: ${msg}`, "error"),
    ["canceled"],
  );

  if (!res) return;
  actions.markSaved(Date.now());
  toast("Project saved", "success");
}

/* ---------- OPEN ---------- */

export async function openProjectFlow(): Promise<void> {
  if (appStore.getState().isDirty) {
    const ok = window.confirm(
      "You have unsaved changes. Open another project anyway?",
    );
    if (!ok) return;
  }

  const res = await invokeOk(
    getIpc().project.open(),
    (msg) => toast(`Open failed: ${msg}`, "error"),
    ["canceled"],
  );

  if (!res) return;
  if (!res.data) return;

  const parsed = parseProject(res.data);
  if (!parsed.ok) {
    toast(`Cannot parse project: ${parsed.error}`, "error");
    return;
  }

  actions.loadProject(parsed.project);
  toast("Project opened", "success");
}

/* ---------- IMPORT MEDIA ---------- */

export async function importMediaFlow(): Promise<void> {
  const res = await invokeOk(getIpc().media.pickFiles(), (msg) =>
    toast(`Import failed: ${msg}`, "error"),
  );

  if (!res) return;
  if (res.files.length === 0) return;

  let added = 0;
  let skipped = 0;

  /* Probe duration paralel untuk semua file yang akan di-import. */
  const probed = await Promise.all(
    res.files.map(async (file) => {
      const kind = detectMediaKind(file.name);
      if (!kind) return null;

      const exists = appStore
        .getState()
        .project.mediaAssets.some((a) => a.path === file.path);
      if (exists) return null;

      /* Image: tidak ada durasi (null). Video/audio: probe. */
      let durationSec: number | null = null;
      if (kind !== "image") {
        durationSec = await probeMediaDuration(mediaUrl(file.path));
      }

      return { file, kind, durationSec };
    }),
  );

  const toAdd: MediaAsset[] = [];
  for (const entry of probed) {
    if (!entry) {
      skipped++;
      continue;
    }
    const { file, kind, durationSec } = entry;
    toAdd.push({
      id: makeId("media"),
      kind,
      path: file.path,
      name: file.name,
      size: file.size,
      durationSec,
      importedAt: Date.now(),
    });
  }

  if (toAdd.length > 0) {
    actions.addMediaAssetsBulk(toAdd);
    added = toAdd.length;
  }

  if (added > 0 && skipped === 0) {
    toast(`Imported ${added} file${added === 1 ? "" : "s"}`, "success");
  } else if (added > 0 && skipped > 0) {
    toast(
      `Imported ${added}, skipped ${skipped} (duplicate/unsupported)`,
      "info",
    );
  } else if (skipped > 0) {
    toast(`Skipped ${skipped} (duplicate/unsupported)`, "warning");
  }
}

function detectMediaKind(fileName: string): MediaAssetKind | null {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (!ext) return null;
  if (["mp4", "mov", "mkv", "webm", "avi", "m4v"].includes(ext)) return "video";
  if (["mp3", "wav", "ogg", "flac", "aac", "m4a"].includes(ext)) return "audio";
  if (["png", "jpg", "jpeg", "webp", "gif", "bmp"].includes(ext))
    return "image";
  return null;
}

/* ---------- DELETE MEDIA ---------- */

export async function deleteMediaAssetsFlow(
  assetIds: readonly string[],
): Promise<void> {
  if (assetIds.length === 0) return;

  const state = appStore.getState();
  const affectedClips = countClipsUsingAssets(state, assetIds);

  if (affectedClips > 0) {
    const assetWord = assetIds.length === 1 ? "media asset" : "media assets";
    const clipWord = affectedClips === 1 ? "clip" : "clips";
    const message =
      `Delete ${assetIds.length} ${assetWord}?\n\n` +
      `${affectedClips} ${clipWord} using this media will also be removed.\n\n` +
      `You can undo with Ctrl+Z.`;
    if (!window.confirm(message)) return;
  }

  actions.deleteMediaAssetsBulk(assetIds);

  const assetWord = assetIds.length === 1 ? "item" : "items";
  const affected = affectedClips > 0 ? ` (+${affectedClips} clips)` : "";
  toast(`Deleted ${assetIds.length} ${assetWord}${affected}`, "success");
}
