/* ============================================================
   CUTFLOW API CONTRACT
   ------------------------------------------------------------
   File ini mendefinisikan SATU-SATUNYA jembatan antara
   renderer (browser) dan main process (Node).

   Aturan:
   - File ini TIDAK berisi implementasi.
   - File ini TIDAK boleh import apa pun dari Electron,
     Node, atau renderer. Hanya tipe murni.
   - Semua perubahan kontrak di sini otomatis terlihat di:
       • preload/api.ts       (implementasi wajib mengikuti)
       • renderer/window.d.ts (tipe Window.cutflow)
   ============================================================ */

/**
 * Metadata aplikasi yang di-expose sekali saat startup.
 * Immutable — tidak berubah selama app hidup.
 */
export interface AppInfo {
  /** Versi app dari package.json (mis. "0.1.0"). */
  readonly version: string;
  /** Versi Electron runtime (mis. "33.2.1"). */
  readonly electron: string;
  /** Platform: 'darwin' | 'win32' | 'linux'. */
  readonly platform:
    | "aix"
    | "android"
    | "darwin"
    | "freebsd"
    | "haiku"
    | "linux"
    | "openbsd"
    | "sunos"
    | "win32"
    | "cygwin"
    | "netbsd";
  /** True kalau app dijalankan dari .exe/.app hasil build. */
  readonly isPackaged: boolean;
}

/* ============================================================
   NAMESPACE: PROJECT
   ------------------------------------------------------------
   Save/load project file (.cutflow.json). Implementasi
   sebenarnya di main/ipc/project.ipc.ts (Fase F13).

   Untuk sekarang hanya mendefinisikan bentuk kontrak;
   return type pakai stub `unknown` untuk payload project
   yang akan di-tipe setelah Project type ada di F3.
   ============================================================ */
export interface ProjectApi {
  /** Buka project dari file. Trigger dialog open di main. */
  open(): Promise<OpenProjectResult>;
  /** Simpan project ke file. Trigger dialog save di main. */
  save(projectJson: string): Promise<SaveProjectResult>;
}

export interface OpenProjectResult {
  ok: boolean;
  /** Path absolut file yang dibuka, jika ok. */
  path?: string;
  /** Isi file mentah (JSON string) — parsing di renderer. */
  data?: string;
  /** Pesan error jika ok = false. */
  error?: string;
}

export interface SaveProjectResult {
  ok: boolean;
  path?: string;
  error?: string;
}

/* ============================================================
   NAMESPACE: MEDIA
   ------------------------------------------------------------
   Import file dari disk ke bin media. Dialog file picker
   di main; hasil dikembalikan sebagai array MediaFile.
   ============================================================ */
export interface MediaApi {
  /** Buka file picker dan pilih satu/lebih file media. */
  pickFiles(): Promise<PickFilesResult>;
}

export interface PickFilesResult {
  ok: boolean;
  /** Array file yang dipilih (kosong jika user cancel). */
  files: MediaFileInfo[];
  error?: string;
}

export interface MediaFileInfo {
  /** Path absolut di disk. */
  path: string;
  /** Nama file (basename). */
  name: string;
  /** Ukuran dalam byte. */
  size: number;
  /** Estimasi durasi? Belum tersedia — diisi nanti via ffprobe. */
  // durationSec?: number;
}

/* ============================================================
   EXPORT
   ============================================================ */
export interface VideoExportParams {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly durationSec: number;
}

export interface ExportApi {
  /** Buka save dialog + prepare temp paths. */
  begin(params: VideoExportParams): Promise<{ ok: boolean; path?: string }>;
  /** Kirim WAV audio buffer (sekali, sebelum frames). */
  setAudio(wav: ArrayBuffer): Promise<{ ok: boolean }>;
  /** Start ffmpeg dengan video+audio inputs. */
  startVideo(): Promise<{ ok: boolean; error?: string }>;
  /** Kirim 1 frame RGBA (W×H×4 bytes). Blocking sampai ffmpeg consume. */
  writeFrame(rgba: ArrayBuffer): Promise<{ ok: boolean }>;
  /** Close stdin → ffmpeg finalize → mp4 ready. */
  finish(): Promise<{ ok: boolean; error?: string }>;
  /** Cancel + cleanup temp. */
  cancel(): Promise<void>;
}

/* ============================================================
   ROOT API
   ------------------------------------------------------------
   Bentuk objek yang di-expose ke window.cutflow.
   ============================================================ */
export interface CutFlowApi {
  /** Info app (sinkron, tidak butuh IPC). */
  readonly app: AppInfo;
  /** Project I/O. */
  readonly project: ProjectApi;
  /** Media file picker. */
  readonly media: MediaApi;

  readonly export: ExportApi;
}
