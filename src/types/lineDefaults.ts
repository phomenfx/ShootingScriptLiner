import type { LineEnding, LineStroke } from "./annotations";
import { DEFAULT_LINE_ENDING } from "./annotations";

export type LineDefaults = {
  stroke: LineStroke;
  widthPt: number;
  fontFamily: string;
  fontSizePt: number;
  /** Bold script labels and text notes (line captions + text tool). */
  labelBold: boolean;
  start: LineEnding;
  end: LineEnding;
};

export const DEFAULT_LINE_DEFAULTS: LineDefaults = {
  stroke: "solid",
  widthPt: 2,
  fontFamily: '"Arial", sans-serif',
  fontSizePt: 11,
  labelBold: true,
  start: { ...DEFAULT_LINE_ENDING },
  end: { cap: "arrow", scalePercent: 100, filled: true },
};
