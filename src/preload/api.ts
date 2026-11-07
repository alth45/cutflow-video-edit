import { ipcRenderer } from "electron";
import { IpcChannel } from "@shared/ipc-channels";
import type {
  CutFlowApi,
  OpenProjectResult,
  SaveProjectResult,
  PickFilesResult,
} from "@shared/types/api";
import type { ExportApi } from "@shared/types/api";

/* ============================================================
   IPC CHANNELS
   ------------------------------------------------------------
   TODO(F3): pindahkan ke `src/shared/ipc-channels.ts` sebagai
   const enum/Object.freeze. Untuk sekarang literal string,
   sinkron dengan handler di main/ipc/* (Fase F13).
   ============================================================ */

/* ============================================================
   APP INFO (sinkron, tanpa IPC)
   ------------------------------------------------------------
   Nilai diambil dari:
   - process.platform     → tersedia di sandboxed preload
   - process.versions     → tersedia di sandboxed preload
   - process.argv         → diisi dari additionalArguments (window.ts)
   ============================================================ */

/** Cari flag CLI berformat `--prefix=value` di process.argv. */
function readCliFlag(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg?.slice(prefix.length);
}

const APP_VERSION = readCliFlag("--cutflow-version=") ?? "0.0.0";
const IS_PACKAGED = readCliFlag("--cutflow-is-packaged=") === "true";

/* ============================================================
   HELPER: INVOKE AMAN
   ------------------------------------------------------------
   Wrapper `ipcRenderer.invoke` yang mengubah rejection menjadi
   nilai fallback. Ini penting karena:
   1. Handler main belum tentu terdaftar (fase F13).
   2. IPC bisa gagal karena alasan runtime (main crash, dll).
   Renderer cukup cek `result.ok` — tidak perlu try/catch.
   ============================================================ */
async function invokeSafe<T>(
  channel: string,
  fallback: T,
  ...args: unknown[]
): Promise<T> {
  try {
    return (await ipcRenderer.invoke(channel, ...args)) as T;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[cutflow:preload] invoke "${channel}" failed:`, err);
    return fallback;
  }
}

/* ============================================================
   IMPLEMENTASI: PROJECT
   ------------------------------------------------------------
   Stub — handler main baru ada di Fase F13.
   Kontrak & wrapper sudah final; tinggal handler di main.
   ============================================================ */

async function openProject(): Promise<OpenProjectResult> {
  return invokeSafe<OpenProjectResult>(IpcChannel.PROJECT_OPEN, {
    ok: false,
    error: "Project I/O belum diimplementasikan (Fase F13).",
  });
}

async function saveProject(projectJson: string): Promise<SaveProjectResult> {
  return invokeSafe<SaveProjectResult>(
    IpcChannel.PROJECT_SAVE,
    { ok: false, error: "Project I/O belum diimplementasikan (Fase F13)." },
    projectJson,
  );
}

async function pickMediaFiles(): Promise<PickFilesResult> {
  return invokeSafe<PickFilesResult>(IpcChannel.MEDIA_PICK_FILES, {
    ok: false,
    files: [],
    error: "Media picker belum diimplementasikan (Fase F13).",
  });
}

const exportApi: ExportApi = {
  begin: (params) => invokeSafe(IpcChannel.EXPORT_BEGIN, { ok: false }, params),
  setAudio: (wav) =>
    invokeSafe(IpcChannel.EXPORT_SET_AUDIO, { ok: false }, wav),
  startVideo: () =>
    invokeSafe(IpcChannel.EXPORT_START_VIDEO, {
      ok: false,
      error: "IPC failed",
    }),
  writeFrame: (rgba) =>
    invokeSafe(IpcChannel.EXPORT_WRITE_FRAME, { ok: false }, rgba),
  finish: () =>
    invokeSafe(IpcChannel.EXPORT_FINISH, { ok: false, error: "IPC failed" }),
  cancel: () => invokeSafe(IpcChannel.EXPORT_CANCEL, undefined),
};

/* ============================================================
   EXPORT: ROOT API
   ------------------------------------------------------------
   Di-`Object.freeze` di setiap level → renderer tidak bisa
   monkey-patch method (mis. menimpa project.save dengan spy).
   ============================================================ */

export const cutflowApi: CutFlowApi = Object.freeze({
  app: Object.freeze({
    version: APP_VERSION,
    electron: process.versions.electron ?? "unknown",
    platform: process.platform,
    isPackaged: IS_PACKAGED,
  }),

  project: Object.freeze({
    open: openProject,
    save: saveProject,
  }),

  media: Object.freeze({
    pickFiles: pickMediaFiles,
  }),

  export: Object.freeze(exportApi),
});
