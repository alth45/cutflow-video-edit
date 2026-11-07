/* ============================================================
   CUTFLOW CONSTANTS
   ------------------------------------------------------------
   Nilai-nilai yang dipakai oleh main, preload, dan renderer.
   Semua konstanta yang mengatur perilaku domain (bukan style)
   tinggal di sini — single source of truth.

   Aturan:
   - File ini TIDAK berisi logic. Hanya nilai tetap.
   - Grup per domain (playback, timeline, zoom, UI metrics)
     dalam `Object.freeze` untuk mencegah mutasi runtime.
   - Konstanta yang HANYA dipakai satu modul spesifik tetap
     di modulnya (mis. warna clip → stylesheet, bukan di sini).
   ============================================================ */

/* ============================================================
   PLAYBACK
   ------------------------------------------------------------
   Mendefinisikan "dunia waktu" aplikasi: durasi sequence,
   framerate, dan titik awal playhead.
   ============================================================ */
export const PLAYBACK = Object.freeze({
  /** Durasi total sequence default, dalam detik. */
  DURATION_SEC: 60,

  /** Frame per detik (framerate). Dipakai untuk format timecode. */
  FPS: 30,

  /**
   * Progress awal playhead (0..1) saat app dibuka.
   * 0.18 = ~10.8 detik, sama dengan nilai awal di video-design.html.
   */
  INITIAL_PROGRESS: 0.18,

  /** Interval label major di ruler timeline, dalam detik. */
  RULER_LABEL_INTERVAL_SEC: 5,

  /** Interval sub-tick di ruler (garis minor), dalam detik. */
  RULER_TICK_INTERVAL_SEC: 1,

  /**
   * Batas maksimum sequence duration. Auto-extend tidak akan
   * melebihi nilai ini. Cegah drag/trim "unlimited" yang bisa
   * bikin ruler render ribuan tick (performa drop).
   */
} as const);

/* ============================================================
   TIMELINE GEOMETRY
   ------------------------------------------------------------
   Ukuran piksel yang HARUS konsisten antara CSS dan JS
   (dipakai untuk hit-testing, snap, dan posisi clip).
   ============================================================ */
export const TIMELINE = Object.freeze({
  /** Tinggi satu track, dalam piksel. */
  TRACK_HEIGHT_PX: 52,

  /** Tinggi ruler, dalam piksel. */
  RULER_HEIGHT_PX: 28,

  /** Lebar kolom track header (kiri), dalam piksel. */
  TRACK_HEADER_WIDTH_PX: 132,

  /**
   * Jarak maksimal (px) sebuah playhead/clip "menempel" ke titik
   * snap terdekat. Kalau lebih dari ini, tidak snap.
   */
  SNAP_THRESHOLD_PX: 8,

  /** Durasi minimum sebuah clip setelah trim, dalam detik. */
  MIN_CLIP_DURATION_SEC: 1 / 30, // = 1 frame @ 30fps

  MAX_SEQUENCE_DURATION_SEC: 24 * 3600,

  /**
   * Floor untuk auto-adjust sequence duration. Kalau content
   * sangat pendek (mis. trim audio jadi 2s), sequence tetap
   * minimal 5s supaya ruler/playhead tetap usabel.
   */
  MIN_SEQUENCE_DURATION_SEC: 5, // ← TAMBAH
} as const);

/* ============================================================
   ZOOM
   ------------------------------------------------------------
   Skala horizontal timeline. 1 = 100% (muat 60 detik dalam
   lebar viewport). 3 = 300% (60 detik jadi 3x lebih lebar,
   bisa di-scroll horizontal).
   ============================================================ */
export const ZOOM = Object.freeze({
  MIN: 1,
  MAX: 3,
  STEP: 0.05,
  DEFAULT: 1,
} as const);

/* ============================================================
   TIMECODE
   ------------------------------------------------------------
   Format timecode yang dipakai di transport & ruler.
   ============================================================ */
export const TIMECODE = Object.freeze({
  /**
   * Timecode "penuh" untuk display transport (Current/Duration).
   * Format: HH:MM:SS:FF — jam:menit:detik:frame.
   */
  FULL_FORMAT: "HH:MM:SS:FF" as const,

  /**
   * Timecode singkat untuk label ruler.
   * Format: M:SS — menit:detik tanpa jam.
   */
  SHORT_FORMAT: "M:SS" as const,
} as const);
