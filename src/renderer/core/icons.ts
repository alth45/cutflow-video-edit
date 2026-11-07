import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  Undo2,
  Redo2,
  Search,
  Plus,
  Download,
  MousePointer2,
  Scissors,
  Hand,
  Type,
  Magnet,
  ZoomIn,
  ZoomOut,
  Maximize,
  Volume2,
  VolumeX,
  Film,
  Music,
  Eye,
  Lock,
  ChevronDown,
  Trash2,
  Info,
  Check,
  AlertTriangle,
  X,
  Blend,
  Moon,
  ArrowRight,
  MoveHorizontal,
  Bold,
  Italic,
  Underline,
  Square,
  Circle,
  Diamond,
  createElement,
  Sun,
  ArrowDown,
  Columns2,
  type IconNode,
  DiamondMinus,
} from "lucide";
/* ============================================================
   ICONS — LUCIDE REGISTRY
   ------------------------------------------------------------
   Mapping nama semantik (dipakai di modul) → Lucide IconNode.

   Manfaat:
   - Type-safe: IconName = keyof ICONS. Typo = compile error.
   - Remappable: ganti icon visual dengan edit 1 baris di sini,
     tanpa sentuh call site.
   - Tree-shake: hanya icon yang di-import yang masuk bundle.
   - Kustom: tetap bisa override stroke-width/color via CSS.

   Pilihan nama mengikuti semantik UI, bukan nama Lucide —
   supaya kalau nanti ganti library (Phosphor, Heroicons, dll.),
   call site tidak berubah.
   ============================================================ */

const ICONS = {
  /* Playback */
  play: Play,
  pause: Pause,
  "skip-start": SkipBack, // |◀
  "skip-end": SkipForward, // ▶|
  "step-back": StepBack, // ◀ (1 frame)
  "step-fwd": StepForward, // ▶ (1 frame)

  /* Actions */
  undo: Undo2,
  redo: Redo2,
  search: Search,
  plus: Plus,
  download: Download,
  trash: Trash2,

  /* Tools */
  pointer: MousePointer2,
  razor: Scissors,
  hand: Hand,
  text: Type,
  magnet: Magnet,

  /* Zoom & view */
  "zoom-in": ZoomIn,
  "zoom-out": ZoomOut,
  fullscreen: Maximize,
  volume: Volume2,
  "volume-muted": VolumeX,

  /* Tracks */
  film: Film,
  music: Music,
  eye: Eye,
  lock: Lock,
  chevron: ChevronDown,
  /* Transitions */
  blend: Blend,
  moon: Moon,
  "arrow-right": ArrowRight,
  "move-horizontal": MoveHorizontal,
  /* Text style */
  bold: Bold, // ← TAMBAH
  italic: Italic, // ← TAMBAH
  underline: Underline, // ← TAMBAH
  stroke: Square, // ← TAMBAH (outlined box = stroke)
  outline: Circle, // ← TAMBAH (empty ring = outline only)
  diamond: Diamond,
  /* Feedback */
  info: Info,
  check: Check,
  alert: AlertTriangle,
  x: X,

  /* Transitions — extended */
  sun: Sun,
  "arrow-down": ArrowDown,
  columns: Columns2,
} as const satisfies Record<string, IconNode>;

export type IconName = keyof typeof ICONS;

/**
 * Buat SVG element untuk icon berdasarkan nama semantik.
 *
 * Lucide menghasilkan `<svg>` dengan:
 *   - viewBox="0 0 24 24"
 *   - fill="none" stroke="currentColor" stroke-width="2"
 *   - stroke-linecap="round" stroke-linejoin="round"
 *
 * Ukuran (16px default) & warna (via `color`) dikontrol CSS.
 */
export function createIcon(name: IconName, className = "ic"): SVGElement {
  const svg = createElement(ICONS[name]);
  svg.classList.add(...className.split(/\s+/).filter(Boolean));
  return svg;
}

/**
 * Ganti konten SVG dengan icon lain — mempertahankan `<svg>`
 * element (identity, class, style). Dipakai untuk toggle
 * play ↔ pause tanpa re-create element.
 */
export function setIconPath(svg: SVGElement, name: IconName): void {
  const next = createElement(ICONS[name]);
  svg.replaceChildren(...Array.from(next.childNodes));
}
