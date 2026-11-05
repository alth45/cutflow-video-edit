import type { Track } from './timeline';

/* ============================================================
   PROJECT DOMAIN TYPES
   ------------------------------------------------------------
   Root model aplikasi: Project berisi 1 Sequence + N MediaAsset.

   Hubungan:
     Project
       ├── Sequence (dengan tracks[] berisi clips)
       └── MediaAsset[] (referenced oleh clip.source.mediaId)

   File ini adalah KONTRAK untuk:
   - Save/load project (F13)
   - Store state (F5)
   - Editor seluruh UI (F7–F11)

   ATURAN:
   - Semua `readonly` → immutability (konsisten dengan timeline.ts).
   - Referensi via ID, bukan objek (normalisasi data).
   - Zero logic. Factory & validator ada di state/utils (F5).
   ============================================================ */

/* ============================================================
   SCHEMA VERSION
   ------------------------------------------------------------
   Setiap kali struktur Project berubah secara breaking (rename
   field, ganti tipe, hapus field), naikkan versi.

   Migrasi saat load (F13):
     if (data.version < CURRENT) migrate(data);
     if (data.version > CURRENT) reject("project terlalu baru");

   Nilai:
     - String semver-ish — mudah dibaca di file JSON
     - Bukan number — supaya bisa ekspresikan "v1.0.0" vs "v1.1.0"
   ============================================================ */
export const PROJECT_SCHEMA_VERSION = '1.0.0' as const;
export type ProjectSchemaVersion = typeof PROJECT_SCHEMA_VERSION;

/* ============================================================
   MEDIA ASSET
   ------------------------------------------------------------
   File media yang di-import user (video/audio/image).

   Asset BUKAN clip — asset adalah "sumber", clip adalah
   "penggunaan sumber di timeline". Satu asset bisa dipakai
   N clip (mis. cut berulang).

   Disimpan di `Project.mediaAssets`. Clip hanya simpan `mediaId`.
   Ini memungkinkan:
   - Relink (pindah folder) tanpa sentuh timeline.
   - Dedup otomatis (import file yang sama 2x → satu asset).
   - Asset lifespan independen dari clip.
   ============================================================ */

/** Jenis media yang didukung. */
export type MediaAssetKind = 'video' | 'audio' | 'image';

export interface MediaAsset {
  /** ID unik asset (nanoid-lite). */
  readonly id: string;

  /** Jenis media — menentukan cara clip dibuat saat drag ke timeline. */
  readonly kind: MediaAssetKind;

  /**
   * Path absolut di disk.
   *
   * Catatan: bisa berubah saat "Relink Media" (fitur fase lanjut).
   * Tidak boleh dipakai sebagai identifier — gunakan `id`.
   */
  readonly path: string;

  /** Nama file (basename) untuk display di bin. */
  readonly name: string;

  /** Ukuran file dalam byte. Untuk info di UI. */
  readonly size: number;

  /**
   * Durasi media, dalam detik.
   *
   * `null` untuk:
   *   - kind 'image' (tidak ada durasi — clip durasi ditentukan user)
   *   - durasi belum terdeteksi (ffprobe async, fase lanjut)
   *
   * Bukan optional (`?`) tapi eksplisit `| null` — supaya pemanggil
   * harus handle kedua kasus (tidak bisa lupa).
   */
  readonly durationSec: number | null;

  /**
   * Timestamp (ms epoch) saat asset di-import.
   * Dipakai untuk sorting default di bin.
   */
  readonly importedAt: number;
}

/* ============================================================
   SEQUENCE
   ------------------------------------------------------------
   Satu timeline lengkap: track + pengaturan render.

   Saat ini CutFlow hanya support 1 sequence per project
   (seperti original video-design.html). Arsitektur siap
   untuk multi-sequence di masa depan: Project.sequences
   akan jadi `Sequence[]` + `activeSequenceId`.

   Multi-sequence = migrasi schema (v2.0.0). Belum sekarang.
   ============================================================ */

export interface Sequence {
  /** ID unik sequence. */
  readonly id: string;

  /** Nama display di preview header (mis. "Sequence 01"). */
  readonly name: string;

  /** Resolusi horizontal, piksel. Mis. 1920. */
  readonly width: number;

  /** Resolusi vertikal, piksel. Mis. 1080. */
  readonly height: number;

  /** Frame per detik sequence. */
  readonly fps: number;

  /**
   * Durasi total sequence, dalam detik.
   *
   * Berbeda dengan `PLAYBACK.DURATION_SEC` di constants:
   *   - constants.DURATION_SEC = default untuk sequence baru
   *   - sequence.durationSec  = nilai aktual (bisa user ubah)
   *
   * Layout timeline mengikuti nilai ini (ruler span, zoom base).
   */
  readonly durationSec: number;

  /**
   * Track dalam urutan display.
   *
   * Index 0 = paling atas di UI = foreground di komposisi video.
   * Index terakhir = paling bawah = background.
   *
   * Audio track selalu di bawah video track (di-guarantee oleh
   * factory di F5, bukan oleh tipe — untuk fleksibilitas).
   */
  readonly tracks: readonly Track[];
}

/* ============================================================
   PROJECT
   ------------------------------------------------------------
   Root object. Ini yang disimpan ke file `.cutflow.json`.
   ============================================================ */

export interface Project {
  /** Schema version saat project disimpan. Untuk migrasi saat load. */
  readonly schemaVersion: ProjectSchemaVersion;

  /** ID unik project. */
  readonly id: string;

  /** Nama project (bisa user ubah). Default "Untitled Project". */
  readonly name: string;

  /**
   * Timestamp (ms epoch) saat project pertama dibuat.
   * Tetap, tidak berubah seiring save.
   */
  readonly createdAt: number;

  /**
   * Timestamp (ms epoch) saat project terakhir disimpan.
   * Diupdate setiap save — untuk UI "Last modified".
   */
  readonly updatedAt: number;

  /** Sequence (timeline). Satu per project di v1.0.0. */
  readonly sequence: Sequence;

  /**
   * Semua media asset yang di-import user.
   *
   * Tidak ada urutan yang dijamin — UI yang sort (mis. by name,
   * by importedAt). Normalisasi data: source of truth untuk
   * setiap `clip.source.mediaId`.
   */
  readonly mediaAssets: readonly MediaAsset[];
}