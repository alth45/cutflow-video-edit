/* ============================================================
   TIMELINE DOMAIN TYPES
   ------------------------------------------------------------
   Model domain untuk timeline: track & clip.

   File ini adalah KONTRAK antar layer:
   - main   : validasi saat save/load project (F13)
   - renderer: render timeline, hit-testing, inspector (F11)
   - state  : state shape, action payload (F5)

   ATURAN:
   - Semua field `readonly` → mutasi harus bikin object baru
     (immutability pola Redux, konsisten dengan Store di F4/F5).
   - Diskriminasi via `kind` → discriminated union untuk
     compile-time safety.
   - Zero logic. Helper & factory ada di state/actions (F5).
   ============================================================ */

/* ============================================================
   KINDS
   ------------------------------------------------------------
   `TrackKind` menentukan perilaku track di UI & komposisi:
   - 'video' : punya clips visual, ikut compositing di preview
   - 'audio' : punya clips audio, ikut mixing di preview

   `ClipKind` menentukan cara render clip:
   - 'video' : media file video → film strip + thumbnail
   - 'audio' : media file audio → waveform
   - 'text'  : title / overlay teks → label teks di clip

   Catatan: 'text' clip HANYA boleh ada di video track
   (tidak ada teks di audio track). Invarian ini dijaga oleh
   actions saat add clip (F5), bukan oleh tipe (untuk simplisitas).
   ============================================================ */
export type TrackKind = "video" | "audio";
export type ClipKind = "video" | "audio" | "text";

/* ============================================================
   COLOR TOKEN
   ------------------------------------------------------------
   Token warna clip, sinkron dengan class di stylesheet:
   `c-purple`, `c-blue`, `c-orange`, `c-teal`,
   `c-pink`, `c-green`, `c-cyan`.

   Renderer cukup render `class="clip c-${clip.colorToken}"`.
   Palet didefinisikan di `styles/components/timeline.css` (F6).

   Sengaja token (bukan hex) supaya:
   - Tema bisa diubah tanpa sentuh data project.
   - File project tersimpan lebih portabel (no absolute color).
   ============================================================ */
export type ClipColorToken =
  | "purple"
  | "blue"
  | "orange"
  | "teal"
  | "pink"
  | "green"
  | "cyan";

/* ============================================================
   CLIP SOURCE
   ------------------------------------------------------------
   Sumber konten clip, discriminated union pada `kind`.

   - 'media' : merujuk ke MediaAsset (via `mediaId`) di project.
     Video/audio file dari disk. Tidak menyimpan path di clip —
     supaya kalau MediaAsset di-relink (pindah folder), semua
     clip otomatis ikut.
   - 'text'  : teks literal (title card, lower-third, dsb).
     Tidak butuh MediaAsset.
   ============================================================ */

/* ============================================================
   CLIP TRANSFORM
   ------------------------------------------------------------
   Properti visual yang bisa diatur via inspector. Semua clip
   (video/text) punya transform. Audio tidak render visual,
   tapi field tetap ada (default) untuk konsistensi schema.
   ============================================================ */
export interface ClipTransform {
  readonly positionX: number; // -100..100
  readonly positionY: number; // -100..100
  readonly scale: number; // 10..200
  readonly rotation: number; // -180..180
  readonly opacity: number; // 0..100
  readonly cropLeft: number; // 0..50
  readonly cropRight: number; // 0..50
  readonly featherEdge: boolean;
}

export const DEFAULT_CLIP_TRANSFORM: ClipTransform = Object.freeze({
  positionX: 0,
  positionY: 0,
  scale: 100,
  rotation: 0,
  opacity: 100,
  cropLeft: 0,
  cropRight: 0,
  featherEdge: false,
});

/* ============================================================
   COLOR CURVE (F14an)
   ------------------------------------------------------------
   Points: input → output mapping. Master curve (all RGB channels
   equally). Sorted by x.
   ============================================================ */
export interface CurvePoint {
  readonly x: number; // 0..100 (input level)
  readonly y: number; // 0..100 (output level — 0=black, 100=white)
}

export interface ClipCurve {
  readonly points: readonly CurvePoint[];
}

export const DEFAULT_CURVE: ClipCurve = Object.freeze({
  points: Object.freeze([
    Object.freeze({ x: 0, y: 0 }),
    Object.freeze({ x: 100, y: 100 }),
  ]),
});

/* ============================================================
   CLIP COLOR
   ------------------------------------------------------------
   Color correction properti. Default = neutral (tidak ada
   filter applied).
   ============================================================ */
export interface ClipColor {
  readonly exposure: number; // -100..100 → brightness 0.5..1.5
  readonly contrast: number; // -100..100 → contrast 0.5..1.5
  readonly saturation: number; // 0..200   → saturate 0..2
  readonly temp: number; // -100..100 → overlay cool/warm tint
  readonly curve: ClipCurve;
}
/* Keys dengan value numeric (exclude curve yang object). */
export type NumericClipColorKey = Exclude<keyof ClipColor, "curve">;

export const DEFAULT_CLIP_COLOR: ClipColor = Object.freeze({
  exposure: 0,
  contrast: 0,
  saturation: 100,
  temp: 0,
  curve: DEFAULT_CURVE,
});

/* ============================================================
   CLIP AUDIO
   ------------------------------------------------------------
   Audio properties untuk clip. Berlaku untuk AudioClip dan
   VideoClip (embedded audio). Text clip punya field tapi
   tidak dipakai.
   ============================================================ */
export interface ClipAudio {
  readonly volume: number; // 0..100
  readonly muted: boolean;
  readonly fadeInSec: number; // 0..3
  readonly fadeOutSec: number; // 0..3
  readonly pan: number; // -100..100 (L..R)
  readonly boostDb: number; // 0..12 (gain boost)
}

export const DEFAULT_CLIP_AUDIO: ClipAudio = Object.freeze({
  volume: 100,
  muted: false,
  fadeInSec: 0,
  fadeOutSec: 0,
  pan: 0,
  boostDb: 0,
});

/* ============================================================
   CHROMA KEY (F14ak)
   ------------------------------------------------------------
   Green screen removal. Preview = SVG filter (real-time).
   Export = canvas pixel manipulation (frame-accurate).

   Similarity: 0-100. Higher = remove more greenish pixels.
   ============================================================ */
export interface ClipChromaKey {
  readonly enabled: boolean;
  readonly keyColor: "green" | "blue";
  readonly similarity: number; // 0..100
}

export const DEFAULT_CHROMA_KEY: ClipChromaKey = Object.freeze({
  enabled: false,
  keyColor: "green",
  similarity: 50,
});

/* ============================================================
   CLIP EFFECT (F14aa)
   ------------------------------------------------------------
   Effect yang di-apply pada clip. Params fleksibel per-kind
   (blur pakai 'amount' px, grayscale pakai 'amount' %, dst.).
   ============================================================ */

export type EffectKind =
  /* --- Filter primitives --- */
  | "blur"
  | "grayscale"
  | "sepia"
  | "brightness"
  | "contrast"
  | "saturate"
  | "hue-rotate"
  | "invert"
  | "drop-shadow"
  /* --- Filter presets (combinations) --- */
  | "vintage"
  | "cinematic"
  | "dreamy"
  | "noir"
  | "punch"
  | "faded"
  | "warm"
  | "cool"
  /* --- Overlay (handled via ::after) --- */
  | "vignette";

export interface ClipEffect {
  readonly id: string;
  readonly kind: EffectKind;
  readonly params: Readonly<Record<string, number>>;
  readonly enabled: boolean;
}

/* ============================================================
   CLIP ANIMATION (F14af)
   ------------------------------------------------------------
   Preset animasi yang di-apply ke clip (image/video/text).
   Satu clip hanya bisa 1 animasi aktif (hindari CSS transform
   conflict — shake + spin = bentrok).
   ============================================================ */
export type AnimationKind =
  /* General — berlaku semua clip kind */
  | "shake"
  | "glitch"
  | "pulse"
  | "spin"
  | "bounce"
  | "swing"
  | "flash"
  | "wave"
  | "zoom"
  | "float"
  | "blur-in"
  | "slide-in"
  | "flicker"
  | "wobble"
  | "heartbeat"
  | "glow"
  | "rainbow"
  | "tilt"
  /* Text-specific */
  | "typewriter"
  | "neon-text";

export type AnimationCategory = "general" | "text";

export interface ClipAnimation {
  readonly kind: AnimationKind;
}
/* ============================================================
   TEXT CLIP STYLE (F14z)
   ------------------------------------------------------------
   Styling untuk text clip. Semua via CSS di preview.
   ============================================================ */
export interface TextClipStyle {
  readonly fontFamily: string;
  readonly fontWeight: 400 | 700;
  readonly fontStyle: "normal" | "italic";
  readonly underline: boolean;
  readonly stroke: boolean;
  readonly strokeWidth: number; // px, 0.5-6
  readonly outlineOnly: boolean; // jika true: no fill, hanya stroke
}

export const DEFAULT_TEXT_STYLE: TextClipStyle = Object.freeze({
  fontFamily: "Inter, system-ui, sans-serif",
  fontWeight: 700,
  fontStyle: "normal",
  underline: false,
  stroke: false,
  strokeWidth: 2,
  outlineOnly: false,
});

/* ============================================================
   KEYFRAME (F14ad)
   ------------------------------------------------------------
   Keyframe = snap value pada waktu tertentu (relatif ke clip
   start). Kalau property punya keyframes, nilainya diinterpolasi
   linear antara keyframe. Kalau tidak punya, pakai base value.
   ============================================================ */
export interface Keyframe {
  readonly id: string;
  readonly timeSec: number; // relatif terhadap clip.startSec
  readonly value: number;
}

export type KeyframeableTransformKey =
  | "positionX"
  | "positionY"
  | "scale"
  | "rotation"
  | "opacity";

export type KeyframeMap = {
  readonly [K in KeyframeableTransformKey]?: readonly Keyframe[];
};

export const KEYFRAMEABLE_KEYS: readonly KeyframeableTransformKey[] = [
  "positionX",
  "positionY",
  "scale",
  "rotation",
  "opacity",
];

/** Clip yang sumbernya file media. */
export interface MediaClipSource {
  readonly kind: "media";
  /** ID `MediaAsset` di project (bukan path file). */
  readonly mediaId: string;
}

/* ============================================================
   TRANSITION
   ------------------------------------------------------------
   Placeholder untuk animasi antar clip (fade, dissolve, dll).
   Ditempatkan di junction dua clip yang adjacent (clip A end ≈
   clip B start).

   F14k scope: fixed duration 0.5s, kind 'cross-dissolve'.
   Future: duration adjustable, kind selectable dari panel
   Transitions via drag, inspector properties.
   ============================================================ */

export type TransitionKind =
  | "cross-dissolve"
  | "dip-to-black"
  | "slide"
  | "zoom-blur"
  | "wipe"
  /* --- New (F14al) --- */
  | "dip-to-white"
  | "slide-vertical"
  | "circle-wipe"
  | "barn-doors"
  | "cross-zoom";

export interface Transition {
  readonly id: string;
  /** Clip sebelum junction (end clip = junction point). */
  readonly beforeClipId: string;
  /** Clip setelah junction (start clip = junction point). */
  readonly afterClipId: string;
  readonly kind: TransitionKind;
  /** Durasi total transisi (center di junction). */
  readonly durationSec: number;
}

/** Clip yang sumbernya teks literal. */
export interface TextClipSource {
  readonly kind: "text";
  /** Isi teks yang ditampilkan. */
  readonly content: string;
  readonly style: TextClipStyle;
}

export type ClipSource = MediaClipSource | TextClipSource;

/* ============================================================
   CLIP
   ------------------------------------------------------------
   Field bersama untuk semua clip. Disimpan sebagai interface
   terpisah (bukan ditulis 3x) untuk hindari duplikasi.
   ============================================================ */
interface ClipBase {
  /** ID unik clip (nanoid-lite, dibuat saat add ke timeline). */
  readonly id: string;
  /** Nama untuk display di label clip. Bisa beda dari nama file. */
  readonly name: string;
  /** Posisi awal di timeline, dalam detik. ≥ 0. */
  readonly startSec: number;
  /** Durasi clip, dalam detik. > 0. */
  readonly durationSec: number;
  /** Token warna → kelas CSS `c-${token}`. */
  readonly colorToken: ClipColorToken;
  readonly transform: ClipTransform;
  readonly color: ClipColor;
  readonly audio: ClipAudio;
  readonly effects: readonly ClipEffect[];
  readonly keyframes: KeyframeMap;
  readonly animation: ClipAnimation | null;
  readonly chromaKey: ClipChromaKey;
}

/**
 * Clip video media — dari file video.
 * Ditempatkan di track video. Render sebagai film strip.
 */
export interface VideoClip extends ClipBase {
  readonly kind: "video";
  readonly source: MediaClipSource;
}

/**
 * Clip audio media — dari file audio (wav/mp3).
 * Ditempatkan di track audio. Render sebagai waveform.
 */
export interface AudioClip extends ClipBase {
  readonly kind: "audio";
  readonly source: MediaClipSource;
}

/**
 * Clip teks — title card / lower-third.
 * Ditempatkan di track video. Render sebagai label teks.
 */
export interface TextClip extends ClipBase {
  readonly kind: "text";
  readonly source: TextClipSource;
}

/**
 * Union semua clip. Gunakan `clip.kind` untuk narrow.
 *
 *   switch (clip.kind) {
 *     case 'video': /* VideoClip  *\/
 *     case 'audio': /* AudioClip  *\/
 *     case 'text' : /* TextClip   *\/
 *   }
 */
export type Clip = VideoClip | AudioClip | TextClip;

/* ============================================================
   TRACK
   ------------------------------------------------------------
   Satu track berisi N clip (bisa kosong).

   Urutan array `Sequence.tracks` (di project.ts, F4) menentukan:
   - UI display: index 0 = paling atas di panel timeline
   - Komposisi video: index 0 = foreground (paling depan),
     index terakhir = background.

   Invarian (dijaga oleh actions, bukan tipe):
   - Track 'audio' hanya berisi AudioClip.
   - Track 'video' hanya berisi VideoClip | TextClip.
   ============================================================ */
export interface Track {
  /** ID unik track (nanoid-lite, dibuat saat sequence dibuat). */
  readonly id: string;
  readonly kind: TrackKind;
  /** Nama display, mis. "V1", "V2", "Music". */
  readonly name: string;
  /** Clips di track ini — TIDAK dijamin terurut, selector yang sort. */
  readonly clips: readonly Clip[];
  /*menampung transisi dari semua clip*/
  readonly transitions: readonly Transition[];
  /** Mute audio track (tidak affect video). */
  readonly muted: boolean;
  /** Lock track — cegah edit clip di track ini. */
  readonly locked: boolean;
  /** Sembunyikan track dari preview (tidak affect export). */
  readonly hidden: boolean;
}
