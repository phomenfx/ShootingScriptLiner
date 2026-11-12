/**
 * Line endings in PDF points. The screen scales these by one zoom factor and
 * the PDF export draws them as they are, so both stay the same size.
 * An arrow's shaft stops at the base of the head instead of running through the tip.
 */
import type { LineEnding } from "../types/annotations";
import { capSupportsFill } from "../types/annotations";

/** Ending length at 100% size, in points. */
export const ENDING_BASE_PT = 8;

export type Point = { x: number; y: number };

export type EndingPrimitive =
  | { kind: "path"; d: string; filled: boolean }
  | { kind: "circle"; r: number; filled: boolean }
  | { kind: "segments"; segments: [Point, Point][] };

export type EndingGeometry = {
  /** How far to pull the shaft back from this end, in points. */
  shaftInsetPt: number;
  strokePt: number;
  primitive: EndingPrimitive;
};

export function endingSizePt(scalePercent: number): number {
  return ENDING_BASE_PT * (Math.max(0, scalePercent) / 100);
}

/** Local figure: tip at the origin, +x pointing outward along the line. */
export function endingGeometry(ending: LineEnding, widthPt: number): EndingGeometry | null {
  if (ending.cap === "none") return null;
  const s = endingSizePt(ending.scalePercent);
  const strokePt = Math.max(0.75, Math.max(0, widthPt) * 0.8);
  const filled = ending.filled && capSupportsFill(ending.cap);
  const shaftInsetPt = ending.cap === "arrow" ? s : 0;

  switch (ending.cap) {
    case "arrow":
      return { shaftInsetPt, strokePt, primitive: { kind: "path", filled, d: chevron(-1, s, filled) } };
    case "arrowReversed":
      return { shaftInsetPt, strokePt, primitive: { kind: "path", filled, d: chevron(1, s, filled) } };
    case "square": {
      const h = s * 0.7;
      return {
        shaftInsetPt,
        strokePt,
        primitive: {
          kind: "path",
          filled,
          d: `M ${-h / 2} ${-h / 2} L ${h / 2} ${-h / 2} L ${h / 2} ${h / 2} L ${-h / 2} ${h / 2} Z`,
        },
      };
    }
    case "circle":
      return { shaftInsetPt, strokePt, primitive: { kind: "circle", r: s * 0.4, filled } };
    case "diamond": {
      const h = s * 0.55;
      return {
        shaftInsetPt,
        strokePt,
        primitive: {
          kind: "path",
          filled,
          d: `M 0 ${-h} L ${h * 0.65} 0 L 0 ${h} L ${-h * 0.65} 0 Z`,
        },
      };
    }
    case "butt":
      return {
        shaftInsetPt,
        strokePt,
        primitive: { kind: "segments", segments: [[{ x: 0, y: -s * 0.5 }, { x: 0, y: s * 0.5 }]] },
      };
    case "slash":
      return {
        shaftInsetPt,
        strokePt,
        primitive: {
          kind: "segments",
          segments: [[{ x: -s * 0.35, y: -s * 0.5 }, { x: s * 0.35, y: s * 0.5 }]],
        },
      };
    default:
      return null;
  }
}

function chevron(direction: 1 | -1, s: number, filled: boolean): string {
  const x = direction * s;
  const y = s * 0.55;
  return `M ${x} ${-y} L 0 0 L ${x} ${y}${filled ? " Z" : ""}`;
}

/**
 * Pull each end back along the segment. An inset never passes the middle,
 * so a short line cannot flip.
 */
export function shaftEnds(start: Point, end: Point, insetStart: number, insetEnd: number): [Point, Point] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return [start, end];
  const cap = len * 0.45;
  const a = Math.min(Math.max(0, insetStart), cap);
  const b = Math.min(Math.max(0, insetEnd), cap);
  return [
    { x: start.x + (dx / len) * a, y: start.y + (dy / len) * a },
    { x: end.x - (dx / len) * b, y: end.y - (dy / len) * b },
  ];
}
