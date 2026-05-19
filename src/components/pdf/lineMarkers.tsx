/** SVG marker definitions for line caps */
export function LineMarkerDefs() {
  return (
    <defs>
      <marker
        id="cap-arrow"
        markerWidth="8"
        markerHeight="8"
        refX="6"
        refY="4"
        orient="auto"
      >
        <path d="M0,0 L8,4 L0,8 Z" fill="context-stroke" />
      </marker>
      <marker
        id="cap-box"
        markerWidth="6"
        markerHeight="6"
        refX="3"
        refY="3"
        orient="auto"
      >
        <rect x="0" y="0" width="6" height="6" fill="context-stroke" />
      </marker>
      <marker
        id="cap-circle"
        markerWidth="6"
        markerHeight="6"
        refX="3"
        refY="3"
      >
        <circle cx="3" cy="3" r="2.5" fill="context-stroke" />
      </marker>
    </defs>
  );
}

export function capMarkerId(cap: string): string | undefined {
  switch (cap) {
    case "arrow":
      return "url(#cap-arrow)";
    case "box":
      return "url(#cap-box)";
    case "circle":
      return "url(#cap-circle)";
    default:
      return undefined;
  }
}

export function strokeDash(stroke: string): string | undefined {
  if (stroke === "dashed") return "8 4";
  if (stroke === "dotted") return "2 4";
  return undefined;
}
