import { clamp01 } from "./coords";
import type { MarginContinuation, NormalizedPoint } from "../types/annotations";

/** Physical inset from top/bottom of PDF page when trimming a cross-margin drag. */
export const MARGIN_CONTINUATION_IN = 0.25;
const PT_PER_INCH = 72;

export type MarginTrimHint = "start" | "end" | "center" | "drawEnd";

/** Normalized Y distance from page edge: (inches * 72) / page height in PDF points. */
export function marginInsetYNormalized(pageHeightPt: number): number {
  const h = pageHeightPt > 1 ? pageHeightPt : 792;
  const raw = (MARGIN_CONTINUATION_IN * PT_PER_INCH) / h;
  return Math.min(0.49, Math.max(0, raw));
}

/** Liang–Barsky clip of segment (a→b) to the closed axis-aligned rectangle [x0,x1]×[y0,y1]. */
export function clipSegmentToRect(
  a: NormalizedPoint,
  b: NormalizedPoint,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): [NormalizedPoint, NormalizedPoint] | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;

  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-12) return q >= -1e-9;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };

  if (!clip(-dx, a.x - x0)) return null;
  if (!clip(dx, x1 - a.x)) return null;
  if (!clip(-dy, a.y - y0)) return null;
  if (!clip(dy, y1 - a.y)) return null;
  if (t0 > t1 - 1e-12) return null;

  return [
    { x: a.x + t0 * dx, y: a.y + t0 * dy },
    { x: a.x + t1 * dx, y: a.y + t1 * dy },
  ];
}

function clampPointToUnitSquare(p: NormalizedPoint): NormalizedPoint {
  return { x: clamp01(p.x), y: clamp01(p.y) };
}

function resolveBothMarginsMode(
  a: NormalizedPoint,
  b: NormalizedPoint,
  hint: MarginTrimHint
): MarginContinuation {
  if (hint === "start") return a.y <= b.y ? "top" : "bottom";
  if (hint === "end" || hint === "drawEnd") return b.y <= a.y ? "top" : "bottom";
  const da = Math.min(Math.abs(a.y), Math.abs(1 - a.y));
  const db = Math.min(Math.abs(b.y), Math.abs(1 - b.y));
  if (a.y < 0 && b.y > 1) return da <= db ? "top" : "bottom";
  return Math.min(a.y, b.y) < 1 - Math.max(a.y, b.y) ? "top" : "bottom";
}

/**
 * After a drag with unclamped endpoints, clamp geometry and set/clear marginContinuation.
 */
export function computeMarginContinuationTrim(
  a: NormalizedPoint,
  b: NormalizedPoint,
  pageHeightPt: number,
  hint: MarginTrimHint = "drawEnd"
): {
  points: [NormalizedPoint, NormalizedPoint];
  marginContinuation: MarginContinuation | undefined;
} {
  const inset = marginInsetYNormalized(pageHeightPt);
  const yT = inset;
  const yB = 1 - inset;

  const crossedTop = Math.min(a.y, b.y) < 0;
  const crossedBottom = Math.max(a.y, b.y) > 1;

  if (!crossedTop && !crossedBottom) {
    return {
      points: [clampPointToUnitSquare(a), clampPointToUnitSquare(b)],
      marginContinuation: undefined,
    };
  }

  let yMin = 0;
  let yMax = 1;
  if (crossedTop && crossedBottom) {
    yMin = yT;
    yMax = yB;
  } else if (crossedTop) {
    yMin = yT;
    yMax = 1;
  } else {
    yMin = 0;
    yMax = yB;
  }

  const clipped = clipSegmentToRect(a, b, 0, yMin, 1, yMax);
  if (!clipped) {
    return {
      points: [clampPointToUnitSquare(a), clampPointToUnitSquare(b)],
      marginContinuation: undefined,
    };
  }

  let mode: MarginContinuation;
  if (crossedTop && !crossedBottom) mode = "top";
  else if (crossedBottom && !crossedTop) mode = "bottom";
  else mode = resolveBothMarginsMode(a, b, hint);

  return {
    points: clipped,
    marginContinuation: mode,
  };
}
