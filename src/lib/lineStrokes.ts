import type { LineStroke } from "../types/annotations";

export const STROKE_OPTIONS: { value: LineStroke; label: string }[] = [
  { value: "solid", label: "Solid" },
  { value: "dashed_2_2", label: "Dashed (2-2)" },
  { value: "dashed_3_3", label: "Dashed (3-3)" },
  { value: "dashed_4_4", label: "Dashed (4-4)" },
  { value: "dashed_4_3_2_3", label: "Dashed (4-3-2-3)" },
  { value: "dashed_4_3_16_3", label: "Dashed (4-3-16-3)" },
  { value: "dashed_8_4_4_4", label: "Dashed (8-4-4-4)" },
  { value: "dotted", label: "Dotted" },
];

export function strokeDashArray(stroke: LineStroke, widthPt: number): string | undefined {
  const parts = strokeDashParts(stroke, widthPt);
  if (!parts?.length) return undefined;
  return parts.join(" ");
}

/** Dash pattern in PDF points (same geometry as SVG strokeDashArray). */
export function strokeDashPatternPdf(stroke: LineStroke, widthPt: number): number[] | undefined {
  const parts = strokeDashParts(stroke, widthPt);
  return parts?.length ? parts : undefined;
}

function strokeDashParts(stroke: LineStroke, widthPt: number): number[] | undefined {
  const w = Math.max(0.5, widthPt);
  switch (stroke) {
    case "dashed_2_2":
      return [2 * w, 2 * w];
    case "dashed_3_3":
      return [3 * w, 3 * w];
    case "dashed_4_4":
      return [4 * w, 4 * w];
    case "dashed_4_3_2_3":
      return [4 * w, 3 * w, 2 * w, 3 * w];
    case "dashed_4_3_16_3":
      return [4 * w, 3 * w, 16 * w, 3 * w];
    case "dashed_8_4_4_4":
      return [8 * w, 4 * w, 4 * w, 4 * w];
    case "dotted":
      return [w, 2 * w];
    default:
      return undefined;
  }
}

/** Migrate legacy stroke names */
export function normalizeStroke(raw: string): LineStroke {
  if (raw === "dashed") return "dashed_4_4";
  if (raw === "dotted") return "dotted";
  if (STROKE_OPTIONS.some((o) => o.value === raw)) return raw as LineStroke;
  return "solid";
}
