import type { Project } from "./project";

/* ============================================================
   APP STATE TYPES
   ------------------------------------------------------------
   Bentuk state untuk `appStore` (F5).

   DUA KATEGORI STATE:
   1. Persisted   — bagian dari `Project`, disimpan ke file.
   2. Ephemeral   — state runtime (selection, playback, UI).
                    HILANG saat app restart.

   Ephemeral sengaja TIDAK dicampur dengan `Project`. Kalau
   dimasukkan ke file, akan ada noise di JSON (progress, tab,
   scroll) yang bukan bagian dari "karya" user.

   ATURAN:
   - Semua `readonly` → immutability, konsisten dengan domain types.
   - Zero derived state. Nilai turunan dihitung di `selectors.ts`
     (F5), tidak disimpan di sini.
   - Zero logic. Factory & default values di `appStore.ts` (F5).
   ============================================================ */

/* ============================================================
   SELECTION
   ------------------------------------------------------------
   Apa yang sedang di-select / di-fokus user.

   `selectedClipIds` array walau UI asli single-select:
   - Forward-compatible dengan multi-select (Shift+click).
   - Kontrak tidak perlu berubah saat fitur ditambah.
   - Controller (F11) yang enforce single-select kalau perlu.
   ============================================================ */
export interface SelectionState {
  /** ID clip yang sedang di-select. Kosong = tidak ada. */
  readonly selectedClipIds: readonly string[];
  /** Track yang sedang aktif (fokus UI). Untuk add clip via drop. */
  readonly activeTrackId: string | null;
  readonly selectedTransitionId: string | null;
}

/* ============================================================
   PLAYBACK
   ------------------------------------------------------------
   State playhead & transport.

   Source of truth = `currentTimeSec` (bukan progress 0..1).
   Alasan:
   - Kalau `sequence.durationSec` berubah (user extend timeline),
     "10.5 detik" tetap "10.5 detik". Kalau pakai progress 0..1,
     "18%" akan jadi titik waktu berbeda setelah durasi berubah.
   - Konsisten dengan cara pandang user (waktu, bukan persentase).
   - Progress 0..1 = derived → dihitung di selector:
       progress = currentTimeSec / sequence.durationSec
   ============================================================ */
export interface PlaybackState {
  /** True saat tombol play aktif; tick() berjalan tiap frame. */
  readonly playing: boolean;
  /** Posisi playhead dalam detik. Range: [0, sequence.durationSec]. */
  readonly currentTimeSec: number;
  readonly muted: boolean;
}

/* ============================================================
   UI — MEDIA PANEL
   ============================================================ */
export type MediaPanelTab =
  | "media-bin"
  | "media-fx"
  | "media-tr"
  | "media-anim"
  | "media-shape";

export interface MediaPanelState {
  readonly activeTab: MediaPanelTab;
  readonly searchQuery: string;
  readonly selectedAssetIds: readonly string[];
}

/* ============================================================
   UI — INSPECTOR PANEL
   ============================================================ */
export type InspectorPanelTab = "insp-video" | "insp-audio" | "insp-color";

export interface InspectorPanelState {
  readonly activeTab: InspectorPanelTab;
  readonly collapsedGroups: readonly string[];
}

/* ============================================================
   UI — TIMELINE VIEW
   ============================================================ */
export type TimelineTool = "pointer" | "razor" | "hand" | "text";

export interface TimelineViewState {
  readonly zoom: number;
  readonly snapEnabled: boolean;
  readonly activeTool: TimelineTool;
}

/* ============================================================
   UI — LAYOUT (F14v)
   ============================================================ */
export interface LayoutState {
  readonly mediaHidden: boolean;
  readonly inspectorHidden: boolean;
  readonly timelineHidden: boolean;
  readonly previewFullscreen: boolean;
}

/* ============================================================
   UI — AGGREGATE
   ============================================================ */
export interface UiState {
  readonly media: MediaPanelState;
  readonly inspector: InspectorPanelState;
  readonly timeline: TimelineViewState;
  readonly layout: LayoutState;
}

/* ============================================================
   APP STATE (ROOT)
   ------------------------------------------------------------
   Bentuk lengkap yang disimpan di `appStore`.

   Urutan deklarasi field mengikuti hierarki kepentingan:
   1. `project`     — data utama (persisted)
   2. `isDirty`     — flag "ada perubahan belum disimpan"
   3. `selection`   — apa yang di-edit
   4. `playback`    — state transport
   5. `ui`          — tampilan panel
   ============================================================ */
export interface AppState {
  /**
   * Project aktif. Immutable — setiap edit menghasilkan `project`
   * object baru. Ini memudahkan subscriber mendeteksi perubahan
   * (referensi berubah) dan bisa optimize render.
   */
  readonly project: Project;

  /**
   * True jika project sudah diedit tapi belum disimpan.
   *
   * Di-set `true` oleh action yang mengubah `project`.
   * Di-set `false` oleh `saveProject` action (F5).
   *
   * Dipakai untuk:
   * - Judul window: "CutFlow — Untitled* ".
   * - Dialog konfirmasi saat close (F14).
   * - Autosave trigger (fase lanjut).
   */
  readonly isDirty: boolean;
  readonly history: HistoryState;
  readonly selection: SelectionState;
  readonly playback: PlaybackState;
  readonly ui: UiState;
}

/* ============================================================
   HISTORY (F14e)
   ------------------------------------------------------------
   Undo/redo stack. Snapshot hanya mereferensikan `project`
   (frozen → immutable → reference stabil). `isDirty` ikut
   disimpan karena saat undo, status dirty harus ikut kembali
   ke snapshot tersebut.
   ============================================================ */
export interface HistorySnapshot {
  readonly project: Project;
  readonly isDirty: boolean;
}

export interface HistoryState {
  /** Snapshot sebelum edit terakhir. Yang terakhir = paling baru. */
  readonly past: readonly HistorySnapshot[];
  /** Snapshot untuk redo (di-clear saat ada edit baru). */
  readonly future: readonly HistorySnapshot[];
}
