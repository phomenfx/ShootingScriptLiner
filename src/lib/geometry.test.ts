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

describe("bracket, double arrow and dot", () => {
  const at = (cap: "bracket" | "doubleArrow" | "dot", filled = true) => endingGeometry({ cap, scalePercent: 100, filled }, 2)!;

  it("draws a bracket as a bar with two arms pointing back", () => {
    const geo = at("bracket");
    expect(geo.primitive.kind).toBe("segments");
    if (geo.primitive.kind !== "segments") return;
    expect(geo.primitive.segments).toHaveLength(3);
    expect(geo.primitive.segments.every(([a, b]) => a.x <= 0 && b.x <= 0)).toBe(true);
  });

  it("draws a double arrow as two chevrons and pulls the shaft back further when filled", () => {
    const filled = at("doubleArrow");
    expect(filled.primitive.kind === "path" && filled.primitive.d.match(/M/g)?.length).toBe(2);
    expect(filled.shaftInsetPt).toBeGreaterThan(at("doubleArrow", false).shaftInsetPt);
  });

  it("always fills a dot", () => {
    const geo = at("dot", false);
    expect(geo.primitive).toMatchObject({ kind: "circle", filled: true });
  });
});
