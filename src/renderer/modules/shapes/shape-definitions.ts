import type { ShapeKind } from "@shared/types/timeline";
import type { IconName } from "@core/icons";

/* ============================================================
   SHAPE DEFINITIONS
   ------------------------------------------------------------
   Each shape: SVG path (viewBox 0-100) + display metadata.
   Same `svgContent` used for preview (inline SVG) and export
   (canvas path drawn separately).
   ============================================================ */

export interface ShapeDef {
  readonly kind: ShapeKind;
  readonly name: string;
  readonly icon: IconName;
  /** SVG inner content (paths/rect/circle/...). viewBox 0-100. */
  readonly svgContent: (
    fill: string,
    stroke: string,
    strokeWidth: number,
  ) => string;
}

export const SHAPE_DEFINITIONS: readonly ShapeDef[] = [
  {
    kind: "rectangle",
    name: "Rectangle",
    icon: "square",
    svgContent: (fill, stroke, sw) =>
      `<rect x="10" y="10" width="80" height="80" fill="${fill}" stroke="${stroke}" stroke-width="${sw * 3}" />`,
  },
  {
    kind: "circle",
    name: "Circle",
    icon: "outline",
    svgContent: (fill, stroke, sw) =>
      `<circle cx="50" cy="50" r="40" fill="${fill}" stroke="${stroke}" stroke-width="${sw * 3}" />`,
  },
  {
    kind: "triangle",
    name: "Triangle",
    icon: "triangle",
    svgContent: (fill, stroke, sw) =>
      `<polygon points="50,10 90,90 10,90" fill="${fill}" stroke="${stroke}" stroke-width="${sw * 3}" />`,
  },
  {
    kind: "line",
    name: "Line",
    icon: "minus",
    svgContent: (_fill, stroke, sw) =>
      `<line x1="10" y1="50" x2="90" y2="50" stroke="${stroke}" stroke-width="${sw * 4}" stroke-linecap="round" />`,
  },
  {
    kind: "star",
    name: "Star",
    icon: "star",
    svgContent: (fill, stroke, sw) =>
      `<polygon points="50,5 61,35 95,35 68,57 79,90 50,70 21,90 32,57 5,35 39,35" fill="${fill}" stroke="${stroke}" stroke-width="${sw * 3}" stroke-linejoin="round" />`,
  },
  {
    kind: "arrow",
    name: "Arrow",
    icon: "arrow-right",
    svgContent: (fill, stroke, sw) =>
      `<polygon points="10,40 60,40 60,20 90,50 60,80 60,60 10,60" fill="${fill}" stroke="${stroke}" stroke-width="${sw * 3}" />`,
  },
  {
    kind: "diamond",
    name: "Diamond",
    icon: "diamond",
    svgContent: (fill, stroke, sw) =>
      `<polygon points="50,10 90,50 50,90 10,50" fill="${fill}" stroke="${stroke}" stroke-width="${sw * 3}" />`,
  },
  {
    kind: "hexagon",
    name: "Hexagon",
    icon: "hexagon",
    svgContent: (fill, stroke, sw) =>
      `<polygon points="50,5 90,27 90,73 50,95 10,73 10,27" fill="${fill}" stroke="${stroke}" stroke-width="${sw * 3}" />`,
  },
];

export function getShapeDef(kind: ShapeKind): ShapeDef | undefined {
  return SHAPE_DEFINITIONS.find((s) => s.kind === kind);
}

export function getShapeLabel(kind: ShapeKind): string {
  return getShapeDef(kind)?.name ?? kind;
}
