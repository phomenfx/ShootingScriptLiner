import type { TextAlign } from "../types/annotations";

export const LINE_HEIGHT_EM = 1.2;
export const ASCENT_EM = 0.8;
export const UNDERLINE_OFFSET_EM = 0.15;
export const UNDERLINE_THICKNESS_EM = 0.06;
export const MIN_BOX_EM = 1;
/** Horizontal shear for faux italic. Bundled fonts have no italic files. */
export const ITALIC_SHEAR = 0.25;

export const LABEL_SHIFT_MIN_PT = -2000;
export const LABEL_SHIFT_MAX_PT = 2000;
export const TEXT_BOX_MAX_PT = 4000;

export type BoxHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export const BOX_HANDLES: BoxHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export type TextFrame = {
  left: number;
  /** Top edge. In screen space, y grows downward. */
  top: number;
  width: number;
  height: number;
  baseline: number;
  fontSize: number;
  contentHeight: number;
};

export type LaidOutRun = {
  text: string;
  x: number;
  width: number;
  baseline: number;
  underline: { x1: number; x2: number; y: number } | null;
};

export type BoxResize = {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Undefined clears a stored minimum so the box hugs the text. */
  minHeight: number | undefined;
  widthChanged: boolean;
  heightChanged: boolean;
};

type MeasureText = (text: string) => number;

const HANDLE_EDGES: Record<BoxHandle, { n?: boolean; s?: boolean; e?: boolean; w?: boolean }> = {
  nw: { n: true, w: true },
  n: { n: true },
  ne: { n: true, e: true },
  e: { e: true },
  se: { s: true, e: true },
  s: { s: true },
  sw: { s: true, w: true },
  w: { w: true },
};

export function clampLabelShiftPt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(LABEL_SHIFT_MIN_PT, Math.min(LABEL_SHIFT_MAX_PT, value));
}

export function clampBoxWidthPt(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(TEXT_BOX_MAX_PT, value));
}

export function clampBoxHeightPt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(TEXT_BOX_MAX_PT, value));
}

export function contentHeight(lineCount: number, fontSize: number): number {
  return Math.max(1, lineCount) * fontSize * LINE_HEIGHT_EM;
}

export function wrapText(text: string, maxWidth: number, measure: MeasureText): string[] {
  const paragraphs = text.split("\n");
  const lines: string[] = [];
  for (const para of paragraphs) {
    if (para.length === 0) {
      lines.push("");
      continue;
    }
    const words = para.split(/\s+/).filter((word) => word.length > 0);
    let current = "";
    const flush = () => {
      if (!current) return;
      lines.push(current);
      current = "";
    };
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (measure(candidate) <= maxWidth) {
        current = candidate;
        continue;
      }
      flush();
      if (measure(word) <= maxWidth) {
        current = word;
        continue;
      }
      let chunk = "";
      for (const ch of Array.from(word)) {
        const next = chunk + ch;
        if (chunk && measure(next) > maxWidth) {
          lines.push(chunk);
          chunk = ch;
        } else {
          chunk = next;
        }
      }
      current = chunk;
    }
    flush();
  }
  return lines.length > 0 ? lines : [""];
}

export function alignInset(lineWidth: number, boxWidth: number, align: TextAlign): number {
  const leftover = Math.max(0, boxWidth - lineWidth);
  if (align === "center") return leftover / 2;
  if (align === "right") return leftover;
  return 0;
}

export function layoutTextBlock(opts: {
  text: string;
  left: number;
  baseline: number;
  fontSize: number;
  width?: number;
  minHeight?: number;
  align: TextAlign;
  underline: boolean;
  /** Screen space grows downward. PDF space grows upward. */
  yDown: boolean;
  measure: MeasureText;
}): { frame: TextFrame; runs: LaidOutRun[] } {
  const minWidth = Math.max(1, opts.fontSize * MIN_BOX_EM);
  const boxWidth =
    opts.width != null && opts.width > 0 ? Math.max(opts.width, minWidth) : undefined;
  const broken =
    boxWidth != null ? wrapText(opts.text, boxWidth, opts.measure) : opts.text.split("\n");
  const lines = broken.length > 0 ? broken : [""];
  const widths = lines.map((line) => opts.measure(line));
  const hug = Math.max(minWidth, ...widths, 0);
  const width = boxWidth ?? hug;
  const contentH = contentHeight(lines.length, opts.fontSize);
  const height = Math.max(contentH, opts.minHeight ?? 0);
  const ascent = opts.fontSize * ASCENT_EM;
  const step = opts.fontSize * LINE_HEIGHT_EM * (opts.yDown ? 1 : -1);
  const underlineSign = opts.yDown ? 1 : -1;
  const top = opts.yDown ? opts.baseline - ascent : opts.baseline + ascent;

  const runs: LaidOutRun[] = lines.map((line, index) => {
    const lineWidth = widths[index] ?? 0;
    const x = opts.left + alignInset(lineWidth, width, opts.align);
    const baseline = opts.baseline + index * step;
    const underline =
      opts.underline && lineWidth > 0
        ? {
            x1: x,
            x2: x + lineWidth,
            y: baseline + underlineSign * opts.fontSize * UNDERLINE_OFFSET_EM,
          }
        : null;
    return { text: line, x, width: lineWidth, baseline, underline };
  });

  return {
    frame: {
      left: opts.left,
      top,
      width,
      height,
      baseline: opts.baseline,
      fontSize: opts.fontSize,
      contentHeight: contentH,
    },
    runs,
  };
}

export function applyBoxResize(
  start: TextFrame,
  handle: BoxHandle,
  dx: number,
  dy: number,
  minWidth: number,
  nextContentHeight: number
): BoxResize {
  const edges = HANDLE_EDGES[handle];
  let left = start.left;
  let right = start.left + start.width;
  let top = start.top;
  let bottom = start.top + start.height;

  if (edges.e) right += dx;
  if (edges.w) left += dx;
  if (edges.s) bottom += dy;
  if (edges.n) top += dy;

  if (right - left < minWidth) {
    if (edges.w && !edges.e) left = right - minWidth;
    else right = left + minWidth;
  }

  const widthChanged = Boolean(edges.e || edges.w);
  const heightChanged = Boolean(edges.n || edges.s);

  if (heightChanged && bottom - top < nextContentHeight) {
    if (edges.n && !edges.s) top = bottom - nextContentHeight;
    else bottom = top + nextContentHeight;
  }

  let height = bottom - top;
  let minHeight: number | undefined;
  if (!heightChanged) {
    const extra = Math.max(0, start.height - start.contentHeight);
    height = nextContentHeight + extra;
    minHeight = extra > 0.5 ? height : undefined;
  } else {
    minHeight = height > nextContentHeight + 0.5 ? height : undefined;
  }

  return {
    left,
    top,
    width: right - left,
    height,
    minHeight,
    widthChanged,
    heightChanged,
  };
}

export function resizeTextBox(
  start: TextFrame,
  handle: BoxHandle,
  dx: number,
  dy: number,
  text: string,
  align: TextAlign,
  measure: MeasureText
): BoxResize {
  const minWidth = Math.max(1, start.fontSize * MIN_BOX_EM);
  const prelim = applyBoxResize(start, handle, dx, dy, minWidth, start.contentHeight);
  const nextContent = prelim.widthChanged
    ? layoutTextBlock({
        text,
        left: prelim.left,
        baseline: prelim.top + start.fontSize * ASCENT_EM,
        fontSize: start.fontSize,
        width: prelim.width,
        align,
        underline: false,
        yDown: true,
        measure,
      }).frame.contentHeight
    : start.contentHeight;
  return applyBoxResize(start, handle, dx, dy, minWidth, nextContent);
}

export function boxHandlePoint(frame: TextFrame, handle: BoxHandle): { x: number; y: number } {
  const midX = frame.left + frame.width / 2;
  const midY = frame.top + frame.height / 2;
  const right = frame.left + frame.width;
  const bottom = frame.top + frame.height;
  switch (handle) {
    case "nw":
      return { x: frame.left, y: frame.top };
    case "n":
      return { x: midX, y: frame.top };
    case "ne":
      return { x: right, y: frame.top };
    case "e":
      return { x: right, y: midY };
    case "se":
      return { x: right, y: bottom };
    case "s":
      return { x: midX, y: bottom };
    case "sw":
      return { x: frame.left, y: bottom };
    case "w":
      return { x: frame.left, y: midY };
  }
}

export function boxHandleCursor(handle: BoxHandle): string {
  switch (handle) {
    case "n":
    case "s":
      return "ns-resize";
    case "e":
    case "w":
      return "ew-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
    case "nw":
    case "se":
      return "nwse-resize";
  }
}

export function hitBoxHandle(
  px: number,
  py: number,
  frame: TextFrame,
  radius = 6
): BoxHandle | null {
  let best: BoxHandle | null = null;
  let bestDist = radius * radius;
  for (const handle of BOX_HANDLES) {
    const point = boxHandlePoint(frame, handle);
    const dist = (px - point.x) ** 2 + (py - point.y) ** 2;
    if (dist <= bestDist) {
      best = handle;
      bestDist = dist;
    }
  }
  return best;
}

export function pointInFrame(px: number, py: number, frame: TextFrame): boolean {
  return (
    px >= frame.left &&
    px <= frame.left + frame.width &&
    py >= frame.top &&
    py <= frame.top + frame.height
  );
}

/** Point on the box that the line label origin occupies. Vertical center, horizontal alignment. */
export function alignmentPoint(
  frame: TextFrame,
  align: TextAlign,
  yDown: boolean
): { x: number; y: number } {
  const x =
    align === "center"
      ? frame.left + frame.width / 2
      : align === "right"
        ? frame.left + frame.width
        : frame.left;
  const y = yDown ? frame.top + frame.height / 2 : frame.top - frame.height / 2;
  return { x, y };
}

export function shiftTextBlock<T extends { frame: TextFrame; runs: LaidOutRun[] }>(
  block: T,
  dx: number,
  dy: number
): T {
  if (dx === 0 && dy === 0) return block;
  return {
    ...block,
    frame: {
      ...block.frame,
      left: block.frame.left + dx,
      top: block.frame.top + dy,
      baseline: block.frame.baseline + dy,
    },
    runs: block.runs.map((run) => ({
      ...run,
      x: run.x + dx,
      baseline: run.baseline + dy,
      underline: run.underline
        ? {
            x1: run.underline.x1 + dx,
            x2: run.underline.x2 + dx,
            y: run.underline.y + dy,
          }
        : null,
    })),
  };
}

/** Move a laid-out block so its alignment point sits on the origin. */
export function pinBlockToOrigin<T extends { frame: TextFrame; runs: LaidOutRun[] }>(
  block: T,
  align: TextAlign,
  origin: { x: number; y: number },
  yDown: boolean
): T {
  const point = alignmentPoint(block.frame, align, yDown);
  return shiftTextBlock(block, origin.x - point.x, origin.y - point.y);
}

export function primaryOffsetFromPlacement(
  parent: { x: number; y: number },
  frame: TextFrame,
  align: TextAlign,
  scale: number
): { labelOffsetXPt: number; labelOffsetYPt: number } {
  const origin = alignmentPoint(frame, align, true);
  const s = scale || 1;
  return {
    labelOffsetXPt: clampLabelShiftPt((origin.x - parent.x) / s),
    labelOffsetYPt: clampLabelShiftPt((parent.y - origin.y) / s),
  };
}

export function secondaryOffsetFromPlacement(
  parent: { x: number; y: number },
  frame: TextFrame,
  align: TextAlign,
  fontSizePx: number,
  scale: number
): { secondaryOffsetXPt: number; secondaryGapPt: number } {
  const origin = alignmentPoint(frame, align, true);
  const s = scale || 1;
  return {
    secondaryOffsetXPt: clampLabelShiftPt((origin.x - parent.x) / s),
    secondaryGapPt: clampLabelShiftPt((origin.y - parent.y - fontSizePx) / s),
  };
}

export type ItalicMatrix = { a: number; b: number; c: number; d: number; e: number; f: number };

/** Shear that keeps the baseline point fixed. Glyphs above the baseline slant right. */
export function italicBaselineMatrix(baselineY: number, shear = ITALIC_SHEAR): ItalicMatrix {
  return { a: 1, b: 0, c: shear, d: 1, e: -shear * baselineY, f: 0 };
}

export function transformPoint(
  matrix: ItalicMatrix,
  x: number,
  y: number
): { x: number; y: number } {
  return {
    x: matrix.a * x + matrix.c * y + matrix.e,
    y: matrix.b * x + matrix.d * y + matrix.f,
  };
}

let measureCtx: CanvasRenderingContext2D | null | undefined;

export function viewerFontShorthand(
  family: string,
  sizePx: number,
  bold: boolean,
  italic: boolean
): string {
  return `${italic ? "italic" : "normal"} ${bold ? 600 : 400} ${sizePx}px ${family}`;
}

export function measureViewerText(text: string, font: string): number {
  if (measureCtx === undefined) {
    measureCtx = document.createElement("canvas").getContext("2d");
  }
  if (!measureCtx) return text.length * 8;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}
