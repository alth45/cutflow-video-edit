/* ============================================================
   MARQUEE LOGIC — pure
   ============================================================ */

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** AABB intersection test. */
export function intersects(a: Rect, b: Rect): boolean {
  return (
    a.left <= b.right &&
    a.right >= b.left &&
    a.top <= b.bottom &&
    a.bottom >= b.top
  );
}

/** Bangun Rect dari dua titik (order-independent). */
export function rectFromPoints(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): Rect {
  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    right: Math.max(x1, x2),
    bottom: Math.max(y1, y2),
  };
}

/** True jika rect lebih kecil dari threshold (click, bukan drag). */
export function isTinyDrag(rect: Rect, thresholdPx = 5): boolean {
  return (
    rect.right - rect.left < thresholdPx && rect.bottom - rect.top < thresholdPx
  );
}
