/* ============================================================
   OVERLAY DRAG LOGIC — pure
   ============================================================ */

/**
 * Konversi pixel delta ke positionX/Y delta.
 *
 * Mapping: translate(positionX/2 %) → 1% = positionX/2 unit.
 * 1% monitor width = width × 0.01 px.
 * dx px → (dx / width) × 100 % → positionX = 2 × % → dx/width × 200.
 */
export function pixelDeltaToPosition(
  dx: number,
  dy: number,
  monitorWidth: number,
  monitorHeight: number,
): { x: number; y: number } {
  if (monitorWidth <= 0 || monitorHeight <= 0) return { x: 0, y: 0 };
  return {
    x: (dx / monitorWidth) * 200,
    y: (dy / monitorHeight) * 200,
  };
}

export function clampPosition(v: number): number {
  return Math.max(-100, Math.min(100, v));
}
