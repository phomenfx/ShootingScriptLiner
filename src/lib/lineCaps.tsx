import type { ReactNode } from "react";
import type { LineCap, LineEnding } from "../types/annotations";
import { capSupportsFill } from "../types/annotations";

export const CAP_OPTIONS: { value: LineCap; label: string }[] = [
  { value: "none", label: "None" },
  { value: "square", label: "Square" },
  { value: "circle", label: "Circle" },
  { value: "diamond", label: "Diamond" },
  { value: "arrow", label: "Arrow" },
  { value: "butt", label: "Butt" },
  { value: "arrowReversed", label: "Arrow (reversed)" },
  { value: "slash", label: "Slash" },
];

const BASE = 8;

function scale(s: number, pct: number): number {
  return s * (pct / 100);
}

export function lineAngleRad(x1: number, y1: number, x2: number, y2: number): number {
  return Math.atan2(y2 - y1, x2 - x1);
}

export function renderLineCap(
  ending: LineEnding,
  color: string,
  strokeWidth: number,
  angleRad: number,
  atStart: boolean
): { elements: ReactNode; key: string } | null {
  const cap = ending.cap;
  if (cap === "none") return null;

  const rot = (atStart ? angleRad + Math.PI : angleRad) * (180 / Math.PI);
  const s = scale(BASE, ending.scalePercent);
  const sw = Math.max(1, strokeWidth * 0.8);
  const filled = ending.filled && capSupportsFill(ending.cap);
  const key = `${cap}-${ending.scalePercent}-${filled}`;

  const gProps = {
    transform: `rotate(${rot})`,
    stroke: color,
    strokeWidth: sw,
    fill: filled ? color : "none",
    strokeLinejoin: "round" as const,
    strokeLinecap: "round" as const,
  };

  switch (cap) {
    case "arrow": {
      const d = filled
        ? `M${-s},${-s * 0.55} L0,0 L${-s},${s * 0.55} Z`
        : `M${-s},${-s * 0.55} L0,0 L${-s},${s * 0.55}`;
      return {
        key,
        elements: (
          <g {...gProps}>
            <path d={d} />
          </g>
        ),
      };
    }
    case "arrowReversed": {
      const d = filled
        ? `M${s},${-s * 0.55} L0,0 L${s},${s * 0.55} Z`
        : `M${s},${-s * 0.55} L0,0 L${s},${s * 0.55}`;
      return {
        key,
        elements: (
          <g {...gProps}>
            <path d={d} />
          </g>
        ),
      };
    }
    case "square": {
      const h = s * 0.7;
      return {
        key,
        elements: (
          <g {...gProps} fill={filled ? color : "none"}>
            <rect x={-h / 2} y={-h / 2} width={h} height={h} />
          </g>
        ),
      };
    }
    case "circle": {
      const r = s * 0.4;
      return {
        key,
        elements: (
          <g {...gProps}>
            <circle cx={0} cy={0} r={r} />
          </g>
        ),
      };
    }
    case "diamond": {
      const h = s * 0.55;
      return {
        key,
        elements: (
          <g {...gProps}>
            <path d={`M0,${-h} L${h * 0.65},0 L0,${h} L${-h * 0.65},0 Z`} />
          </g>
        ),
      };
    }
    case "butt":
      return {
        key,
        elements: (
          <g {...gProps} fill="none">
            <line x1={0} y1={-s * 0.5} x2={0} y2={s * 0.5} />
          </g>
        ),
      };
    case "slash":
      return {
        key,
        elements: (
          <g {...gProps} fill="none">
            <line x1={-s * 0.35} y1={-s * 0.5} x2={s * 0.35} y2={s * 0.5} />
          </g>
        ),
      };
    default:
      return null;
  }
}

export function migrateCapName(raw: string): LineCap {
  switch (raw) {
    case "box":
      return "square";
    case "arrow":
      return "arrow";
    case "openArrow":
    case "closedArrow":
      return "arrow";
    case "openArrowReversed":
    case "closedArrowReversed":
      return "arrowReversed";
    case "slant":
      return "slash";
    default:
      if (CAP_OPTIONS.some((c) => c.value === raw)) return raw as LineCap;
      return "none";
  }
}
