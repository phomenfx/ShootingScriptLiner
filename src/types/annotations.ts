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

export type TextFieldLocks = {
  shotId: boolean;
  color: boolean;
};

export const DEFAULT_TEXT_LOCKS: TextFieldLocks = {
  shotId: true,
  color: true,
};

export const UNLINKED_TEXT_LOCKS: TextFieldLocks = {
  shotId: false,
  color: false,
};

export const DEFAULT_LINE_ENDING: LineEnding = {
  cap: "none",
  scalePercent: 100,
  filled: true,
};

/** After dragging past page top/bottom; visual labels only (no linked segments). */
export type MarginContinuation = "top" | "bottom";

export type TextAlign = "left" | "center" | "right";

export function isTextAlign(value: unknown): value is TextAlign {
  return value === "left" || value === "center" || value === "right";
}

export type LineAnnotation = {
  id: string;
  kind: "line";
  page: number;
  points: [NormalizedPoint, NormalizedPoint];
  style: LineStyle;
  fontFamily: string;
  fontSizePt: number;
  labelBold: boolean;
  labelItalic?: boolean;
  labelUnderline?: boolean;
  /**
   * Primary label origin offset from the line start, in PDF points.
   * Positive Y is up. Omitted values use the project label offset.
   */
  labelOffsetXPt?: number;
  labelOffsetYPt?: number;
  /** Wrap width of the primary label. Omitted hugs the text on one line. */
  labelWidthPt?: number;
  /** Box height. Omitted hugs the wrapped lines. Extra space sits below the text. */
  labelMinHeightPt?: number;
  labelAlign?: TextAlign;
  /** Continuation label origin offset from the continuation end. */
  secondaryOffsetXPt?: number;
  secondaryGapPt?: number;
  secondaryWidthPt?: number;
  secondaryMinHeightPt?: number;
  secondaryAlign?: TextAlign;
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
  labelItalic?: boolean;
  labelUnderline?: boolean;
  /** Wrap width. Omitted hugs the text. The box origin is `x`/`y` (left edge, first baseline). */
  widthPt?: number;
  minHeightPt?: number;
  align?: TextAlign;
  /** When set with followShot, the note draws that shot's line caption. */
  shotId?: string;
  /** Locked to the shot caption. Unlock to edit this note's own text. */
  followShot?: boolean;
  /** When false, the note is hidden on the script and in the lined PDF. */
  showText?: boolean;
  locks?: TextFieldLocks;
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
