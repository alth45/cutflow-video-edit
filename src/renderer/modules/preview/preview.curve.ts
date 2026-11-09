import type { ClipCurve } from "@shared/types/timeline";
import { sampleCurveTable, isDefaultCurve } from "@modules/effects/curve.logic";

/* ============================================================
   CURVE FILTER — SVG (preview)
   ------------------------------------------------------------
   One filter per clip: `cf-curve-<clipId>`. Applied via
   `filter: url(#id)` in chain after color/effects.
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
 * Create or update curve filter for clip.
 * Return filter ID.
 */
export function ensureCurveFilter(clipId: string, curve: ClipCurve): string {
  const filterId = `cf-curve-${clipId}`;
  let filter: Element | null = document.getElementById(filterId);

  if (!filter) {
    filter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
    filter.setAttribute("id", filterId);
    filter.setAttribute("color-interpolation-filters", "sRGB");

    const componentTransfer = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "feComponentTransfer",
    );

    for (const tag of ["feFuncR", "feFuncG", "feFuncB"] as const) {
      const func = document.createElementNS("http://www.w3.org/2000/svg", tag);
      func.setAttribute("type", "table");
      componentTransfer.appendChild(func);
    }

    filter.appendChild(componentTransfer);
    getSvgDefs().appendChild(filter);
  }

  const tableValues = sampleCurveTable(curve, 32);
  const funcs = filter.querySelectorAll("feFuncR, feFuncG, feFuncB");
  for (const func of funcs) {
    (func as Element).setAttribute("tableValues", tableValues);
  }

  return filterId;
}

/** Remove filter (when curve becomes identity or clip deleted). */
export function removeCurveFilter(clipId: string): void {
  const filter = document.getElementById(`cf-curve-${clipId}`);
  filter?.remove();
}

/** Compute filter part (`url(#...)` or `''`) for a clip. */
export function curveFilterPart(
  clipId: string,
  curve: ClipCurve | undefined,
): string {
  if (!curve || isDefaultCurve(curve)) return "";
  return `url(#${ensureCurveFilter(clipId, curve)})`;
}
