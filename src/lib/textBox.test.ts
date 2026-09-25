import { describe, expect, it } from "vitest";
import { migrateLineAnnotation, migrateTextAnnotation } from "./annotationUtils";
import {
  alignInset,
  alignmentPoint,
  applyBoxResize,
  italicBaselineMatrix,
  layoutTextBlock,
  pinBlockToOrigin,
  transformPoint,
  wrapText,
  type TextFrame,
} from "./textBox";

const chars = (sample: string) => sample.length;

describe("wrapText", () => {
  it("wraps on spaces and keeps explicit newlines", () => {
    expect(wrapText("hello world", 5, chars)).toEqual(["hello", "world"]);
    expect(wrapText("one\n\ntwo", 20, chars)).toEqual(["one", "", "two"]);
  });

  it("breaks a word that is wider than the box", () => {
    expect(wrapText("abcdefghij", 4, chars)).toEqual(["abcd", "efgh", "ij"]);
  });
});

describe("alignInset", () => {
  it("insets a short line inside the box", () => {
    expect(alignInset(40, 100, "left")).toBe(0);
    expect(alignInset(40, 100, "center")).toBe(30);
    expect(alignInset(40, 100, "right")).toBe(60);
  });
});

describe("layoutTextBlock", () => {
  it("aligns each wrapped line on its own and underlines that line's width", () => {
    const laid = layoutTextBlock({
      text: "hello\nhi",
      left: 10,
      baseline: 30,
      fontSize: 10,
      width: 50,
      align: "center",
      underline: true,
      yDown: true,
      measure: (sample) => sample.length * 10,
    });
    expect(laid.runs.map((run) => run.text)).toEqual(["hello", "hi"]);
    expect(laid.runs[0]?.x).toBe(10);
    expect(laid.runs[1]?.x).toBe(25);
    expect(laid.runs[0]?.underline).toEqual({ x1: 10, x2: 60, y: 31.5 });
    expect(laid.runs[1]?.underline).toEqual({ x1: 25, x2: 45, y: 43.5 });
  });

  it("keeps the characters and fixes the italic baseline", () => {
    const source = "Shot 1A";
    const laid = layoutTextBlock({
      text: source,
      left: 8,
      baseline: 20,
      fontSize: 10,
      align: "left",
      underline: false,
      yDown: true,
      measure: (sample) => sample.length * 6,
    });
    expect(laid.runs.map((run) => run.text).join("\n")).toBe(source);
    const run = laid.runs[0]!;
    const point = transformPoint(italicBaselineMatrix(run.baseline), run.x, run.baseline);
    expect(point.x).toBeCloseTo(run.x);
    expect(point.y).toBeCloseTo(run.baseline);
  });
});

describe("applyBoxResize", () => {
  const start: TextFrame = {
    left: 10,
    top: 20,
    width: 100,
    height: 40,
    baseline: 28,
    fontSize: 10,
    contentHeight: 40,
  };

  it("moves the opposite edge when dragging west or north", () => {
    const west = applyBoxResize(start, "w", 15, 0, 10, 40);
    expect(west.left).toBe(25);
    expect(west.width).toBe(85);
    expect(west.left + west.width).toBe(110);

    const north = applyBoxResize(start, "n", 0, -10, 10, 40);
    expect(north.top).toBe(10);
    expect(north.minHeight).toBe(50);
    expect(north.top + (north.minHeight ?? 0)).toBe(60);
  });

  it("does not clip text when the box is shrunk", () => {
    const south = applyBoxResize(start, "s", 0, -30, 10, 40);
    expect(south.minHeight).toBeUndefined();
    expect(south.top).toBe(20);

    const tooNarrow = applyBoxResize(start, "w", 200, 0, 10, 40);
    expect(tooNarrow.width).toBe(10);
    expect(tooNarrow.left + tooNarrow.width).toBe(110);
  });

  it("grows with reflowed content when only the width changes", () => {
    const wider = applyBoxResize(start, "e", 15, 0, 10, 60);
    expect(wider.width).toBe(115);
    expect(wider.left).toBe(10);
    expect(wider.minHeight).toBeUndefined();
    expect(wider.heightChanged).toBe(false);
  });
});

describe("pinBlockToOrigin", () => {
  const block = layoutTextBlock({
    text: "hello\nhi",
    left: 0,
    baseline: 0,
    fontSize: 10,
    width: 50,
    align: "left",
    underline: false,
    yDown: true,
    measure: chars,
  });

  it("puts a left origin on the left edge and the vertical center", () => {
    const pinned = pinBlockToOrigin(block, "left", { x: 100, y: 40 }, true);
    expect(alignmentPoint(pinned.frame, "left", true)).toEqual({ x: 100, y: 40 });
  });

  it("puts a center origin in the middle of the box and a right origin on the right edge", () => {
    const center = pinBlockToOrigin(block, "center", { x: 100, y: 40 }, true);
    const right = pinBlockToOrigin(block, "right", { x: 100, y: 40 }, true);
    expect(alignmentPoint(center.frame, "center", true)).toEqual({ x: 100, y: 40 });
    expect(alignmentPoint(right.frame, "right", true)).toEqual({ x: 100, y: 40 });
    expect(center.frame.left).toBeLessThan(100);
    expect(right.frame.left + right.frame.width).toBe(100);
  });
});

describe("migrate text boxes", () => {
  it("keeps optional box fields and ignores junk", () => {
    const line = migrateLineAnnotation({
      id: "l",
      page: 2,
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      style: { color: "#ff0000", widthPt: 2, stroke: "solid" },
      labelWidthPt: 80,
      labelMinHeightPt: 30,
      labelAlign: "center",
      labelItalic: true,
      labelUnderline: false,
      labelOffsetXPt: 15,
      labelOffsetYPt: Number.NaN,
      secondaryAlign: "justify",
      secondaryOffsetXPt: 4,
    });
    expect(line.labelWidthPt).toBe(80);
    expect(line.labelMinHeightPt).toBe(30);
    expect(line.labelAlign).toBe("center");
    expect(line.labelItalic).toBe(true);
    expect(line.labelUnderline).toBe(false);
    expect(line.labelOffsetXPt).toBe(15);
    expect(line.labelOffsetYPt).toBeUndefined();
    expect(line.secondaryAlign).toBeUndefined();
    expect(line.secondaryOffsetXPt).toBe(4);

    const text = migrateTextAnnotation({
      id: "t",
      page: 1,
      x: 0.2,
      y: 0.3,
      text: "Note",
      color: "#111111",
      widthPt: "wide",
      align: "right",
      labelItalic: true,
    });
    expect(text.widthPt).toBeUndefined();
    expect(text.align).toBe("right");
    expect(text.labelItalic).toBe(true);
  });
});
