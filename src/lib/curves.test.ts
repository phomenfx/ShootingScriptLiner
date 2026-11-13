import { describe, expect, it } from "vitest";
import { polylineStrands, smoothPath, smoothSpan, trimPolyline } from "./strokeGeometry";

const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];

describe("smooth curves", () => {
  it("pass through every point", () => {
    const span = smoothSpan(pts, 0, false);
    expect(span[0]).toEqual({ x: 0, y: 0 });
    expect(span[span.length - 1]!.x).toBeCloseTo(100);
    const path = smoothPath(pts, false);
    expect(path.some((p) => Math.abs(p.x - 100) < 1e-9 && Math.abs(p.y) < 1e-9)).toBe(true);
    expect(path[path.length - 1]).toEqual({ x: 100, y: 100 });
  });

  it("bow out instead of turning a sharp corner", () => {
    // Halfway along the first span, a corner path would be at y = 0; the curve dips below.
    const span = smoothSpan(pts, 0, false);
    expect(span[10]!.y).toBeLessThan(0);
  });

  it("trim length off the ends for endings", () => {
    const line = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const trimmed = trimPolyline(line, 10, 20);
    expect(trimmed[0]!.x).toBeCloseTo(10);
    expect(trimmed[trimmed.length - 1]!.x).toBeCloseTo(80);
  });

  it("lay a pattern along the whole path", () => {
    const path = smoothPath(pts, false);
    const [wave] = polylineStrands(path, "wavy", 2);
    expect(wave!.points.length).toBeGreaterThan(20);
    // The wave ends near the last point of the path.
    const end = wave!.points[wave!.points.length - 1]!;
    expect(Math.hypot(end.x - 100, end.y - 100)).toBeLessThan(10);
    const double = polylineStrands(path, "double", 2);
    expect(double).toHaveLength(2);
  });
});
