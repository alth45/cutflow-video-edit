import type { ClipChromaKey } from "@shared/types/timeline";

/* ============================================================
   CHROMA KEY — SVG FILTER (preview)
   ------------------------------------------------------------
   Generate unique SVG filter per clip (params baked into matrix).
   Apply via `filter: url(#cf-chroma-<clipId>)`.

   Matrix approach (green key):
     A' = (K/2)*R - K*G + (K/2)*B + 1
   Where K = 1 + (similarity/100)*3  →  1..4

   Verify:
     Pure green (0,1,0), K=2: A' = 0 - 2 + 0 + 1 = -1 → clamp 0 (transparent) ✓
     White (1,1,1), K=2:      A' = 1 - 2 + 1 + 1 = 1  → opaque ✓
     Pure red (1,0,0), K=2:   A' = 1 - 0 + 0 + 1 = 2  → clamp 1 (opaque) ✓
   ============================================================ */

let svgDefsContainer: Element | null = null;

function getSvgDefs(): Element {
  if (svgDefsContainer && document.body.contains(svgDefsContainer)) {
    return svgDefsContainer;
  }
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.cssText = "position:absolute;pointer-events:none;";
  svg.setAttribute("aria-hidden", "true");
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  svg.appendChild(defs);
  document.body.appendChild(svg);
  svgDefsContainer = defs;
  return defs;
}

/**
 * Ensure SVG filter exists untuk clip ini (create or update).
 * Return filter ID (untuk dipakai `filter: url(#id)`).
 */
export function ensureChromaFilter(
  clipId: string,
  chroma: ClipChromaKey,
): string {
  const filterId = `cf-chroma-${clipId}`;
  let filter = document.getElementById(filterId) as SVGFilterElement | null;

  if (!filter) {
    filter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
    filter.setAttribute("id", filterId);
    filter.setAttribute("color-interpolation-filters", "sRGB");
    const matrix = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "feColorMatrix",
    );
    matrix.setAttribute("type", "matrix");
    filter.appendChild(matrix);
    getSvgDefs().appendChild(filter);
  }

  const matrix = filter.querySelector("feColorMatrix");
  if (!matrix) return filterId;

  const K = 1 + (chroma.similarity / 100) * 3; // 1..4
  const half = K / 2;

  const values =
    chroma.keyColor === "green"
      ? `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  ${half} ${-K} ${half} 0 1`
      : `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  ${half} ${half} ${-K} 0 1`;

  matrix.setAttribute("values", values);
  return filterId;
}

/** Remove filter ketika chroma disabled atau clip dihapus. */
export function removeChromaFilter(clipId: string): void {
  const filter = document.getElementById(`cf-chroma-${clipId}`);
  filter?.remove();
}
