import type { ClipCurve, CurvePoint } from "@shared/types/timeline";
import { DEFAULT_CURVE } from "@shared/types/timeline";

/* ============================================================
   CURVE LOGIC — pure
   ------------------------------------------------------------
   Catmull-Rom spline for smooth curve display AND filter sampling.
   Same spline function = visual & filter stay in sync.
   ============================================================ */

/** True if curve = identity (identity filter can be skipped). */
export function isDefaultCurve(curve: ClipCurve | undefined): boolean {
  if (!curve || curve.points.length !== 2) return false;
  const [a, b] = curve.points;
  return !!a && !!b && a.x === 0 && a.y === 0 && b.x === 100 && b.y === 100;
}

/** Catmull-Rom between p1 and p2 at t (0..1). */
function catmullRom(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number,
): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

/** Evaluate curve at input x (0..100) → output y (0..100). */
export function evaluateCurveY(
  points: readonly CurvePoint[],
  x: number,
): number {
  if (points.length === 0) return x;
  if (points.length === 1) return points[0]!.y;

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    if (x >= p1.x && x <= p2.x) {
      const p0 = points[i - 1] ?? p1;
      const p3 = points[i + 2] ?? p2;
      const span = p2.x - p1.x;
      const t = span <= 0 ? 0 : (x - p1.x) / span;
      const y = catmullRom(p0.y, p1.y, p2.y, p3.y, t);
      return Math.max(0, Math.min(100, y));
    }
  }
  return x;
}

/** Build SVG `tableValues` string (0..1) via N samples. */
export function sampleCurveTable(curve: ClipCurve, samples = 32): string {
  const pts = curve.points.length > 0 ? curve.points : DEFAULT_CURVE.points;
  const values: string[] = [];
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 100;
    const y = evaluateCurveY(pts, x);
    values.push((y / 100).toFixed(4));
  }
  return values.join(" ");
}

/**
 * Generate SVG path `d` attribute for smooth curve.
 * viewBox 0..100 x, 0..H y (H = box height in SVG units).
 * Y inverted: curve y=0 → svg y=H (bottom), y=100 → svg y=0.
 */
export function curveToPath(
  points: readonly CurvePoint[],
  height = 74,
): string {
  if (points.length < 2) return "";
  const toY = (y: number): number => height - (y / 100) * height;

  let d = `M ${points[0]!.x} ${toY(points[0]!.y)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? points[i + 1]!;

    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = toY(p1.y + (p2.y - p0.y) / 6);
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = toY(p2.y - (p3.y - p1.y) / 6);

    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2.x} ${toY(p2.y)}`;
  }
  return d;
}

/** Build 256-entry LUT (Uint8) from curve for canvas pixel mapping. */
export function buildCurveLUT(curve: ClipCurve): Uint8ClampedArray {
  const pts = curve.points.length > 0 ? curve.points : DEFAULT_CURVE.points;
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    const x = (i / 255) * 100;
    const y = evaluateCurveY(pts, x);
    lut[i] = Math.round((y / 100) * 255);
  }
  return lut;
}

/** Apply curve LUT to RGBA pixel data in-place. */
export function applyCurvePixels(
  data: Uint8ClampedArray,
  lut: Uint8ClampedArray,
): void {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]!]!;
    data[i + 1] = lut[data[i + 1]!]!;
    data[i + 2] = lut[data[i + 2]!]!;
    // alpha unchanged
  }
}
