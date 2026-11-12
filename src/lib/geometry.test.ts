import { describe, expect, it } from "vitest";
import { endingGeometry, endingSizePt, shaftEnds } from "./geometry";
import { DEFAULT_LINE_ENDING } from "../types/annotations";

describe("ending geometry", () => {
  it("sizes every ending from 8 pt at 100%", () => {
    expect(endingSizePt(100)).toBe(8);
    expect(endingSizePt(50)).toBe(4);
    const arrow = endingGeometry({ ...DEFAULT_LINE_ENDING, cap: "arrow", scalePercent: 100 }, 2);
    const square = endingGeometry({ ...DEFAULT_LINE_ENDING, cap: "square", scalePercent: 100 }, 2);
    expect(arrow?.shaftInsetPt).toBe(8);
    expect(square?.shaftInsetPt).toBe(0);
    expect(arrow?.primitive.kind).toBe("path");
  });

  it("stops an arrow shaft at the base of the head", () => {
    const [a, b] = shaftEnds({ x: 0, y: 0 }, { x: 100, y: 0 }, 8, 8);
    expect(a).toEqual({ x: 8, y: 0 });
    expect(b).toEqual({ x: 92, y: 0 });
  });

  it("does not let a short line's insets cross", () => {
    const [a, b] = shaftEnds({ x: 0, y: 0 }, { x: 10, y: 0 }, 8, 8);
    expect(a.x).toBeLessThan(b.x);
    expect(a.x).toBeCloseTo(4.5);
    expect(b.x).toBeCloseTo(5.5);
  });

  it("draws no ending for none", () => {
    expect(endingGeometry(DEFAULT_LINE_ENDING, 2)).toBeNull();
  });
});
