export type NormalizedPoint = { x: number; y: number };

/** PDF-XChange-style line endings */
export type LineCap =
  | "none"
  | "square"
  | "circle"
  | "diamond"
  /** Open vs solid controlled by LineEnding.filled */
  | "arrow"
  | "arrowReversed"
  | "butt"
  | "slash";

export type LineStroke =
  | "solid"
  | "dashed_2_2"
  | "dashed_3_3"
  | "dashed_4_4"
  | "dashed_4_3_2_3"
  | "dashed_4_3_16_3"
  | "dashed_8_4_4_4"
  | "dotted";

export type LineEnding = {
  cap: LineCap;
  /** 50–350, 100 = normal */
  scalePercent: number;
  /** Filled shape uses stroke color as fill; open caps ignore fill */
  filled: boolean;
};

export type LineStyle = {
  stroke: LineStroke;
  widthPt: number;
  color: string;
  start: LineEnding;
  end: LineEnding;
};

export type LineFieldLocks = {
  shotId: boolean;
  shotType: boolean;
  label: boolean;
  color: boolean;
};

export const DEFAULT_LINE_LOCKS: LineFieldLocks = {
  shotId: true,
  shotType: true,
  label: true,
  color: true,
};

export const UNLINKED_LINE_LOCKS: LineFieldLocks = {
  shotId: false,
  shotType: false,
  label: false,
  color: false,
};

export const DEFAULT_LINE_ENDING: LineEnding = {
  cap: "none",
  scalePercent: 100,
  filled: true,
};

/** After dragging past page top/bottom; visual labels only (no linked segments). */
export type MarginContinuation = "top" | "bottom";

export type LineAnnotation = {
  id: string;
  kind: "line";
  page: number;
  points: [NormalizedPoint, NormalizedPoint];
  style: LineStyle;
  fontFamily: string;
  fontSizePt: number;
  labelBold: boolean;
  shotId?: string;
  label?: string;
  showLabel: boolean;
  locks: LineFieldLocks;
  marginContinuation?: MarginContinuation;
};

export type TextAnnotation = {
  id: string;
  kind: "text";
  page: number;
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize?: number;
  fontFamily?: string;
  /** When omitted, uses default line labelBold. */
  labelBold?: boolean;
};

export type Annotation = LineAnnotation | TextAnnotation;

export type ScriptTool = "select" | "line" | "text";

export function isLineAnnotation(a: Annotation): a is LineAnnotation {
  return a.kind === "line";
}

export function isTextAnnotation(a: Annotation): a is TextAnnotation {
  return a.kind === "text";
}

export function capSupportsFill(cap: LineCap): boolean {
  return (
    cap === "square" ||
    cap === "circle" ||
    cap === "diamond" ||
    cap === "arrow" ||
    cap === "arrowReversed"
  );
}
