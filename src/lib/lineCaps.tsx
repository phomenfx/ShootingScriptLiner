import type { ReactNode } from "react";
import { endingGeometry, type EndingPrimitive } from "./geometry";
import type { LineCap, LineEnding } from "../types/annotations";

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

export function lineAngleRad(x1: number, y1: number, x2: number, y2: number): number {
  return Math.atan2(y2 - y1, x2 - x1);
}

export function renderLineCap(
  ending: LineEnding,
  color: string,
  strokeWidth: number,
  angleRad: number,
  atStart: boolean,
  pxPerPt = 1
): { elements: ReactNode; key: string } | null {
  const widthPt = pxPerPt > 0 ? strokeWidth / pxPerPt : strokeWidth;
  const geo = endingGeometry(ending, widthPt);
  if (!geo) return null;

  const rot = (atStart ? angleRad + Math.PI : angleRad) * (180 / Math.PI);
  const key = `${ending.cap}-${ending.scalePercent}-${ending.filled}`;

  return {
    key,
    elements: (
      <g
        transform={`rotate(${rot}) scale(${pxPerPt})`}
        stroke={color}
        strokeWidth={geo.strokePt}
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {renderPrimitive(geo.primitive, color)}
      </g>
    ),
  };
}

function renderPrimitive(primitive: EndingPrimitive, color: string): ReactNode {
  if (primitive.kind === "circle") {
    return <circle cx={0} cy={0} r={primitive.r} fill={primitive.filled ? color : "none"} />;
  }
  if (primitive.kind === "path") {
    return <path d={primitive.d} fill={primitive.filled ? color : "none"} />;
  }
  return primitive.segments.map(([a, b], index) => (
    <line key={index} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
  ));
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
