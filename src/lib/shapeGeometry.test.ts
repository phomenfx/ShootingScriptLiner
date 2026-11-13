import { describe, expect, it } from "vitest";
import type { ShapeMark } from "../model/types";
import { hitsShape, pathBox, shapeHalo, resizeShape, rotationToward, shapeHandles, shapeOutline, simplifyPoints } from "./shapeGeometry";

const box = (extra: Partial<ShapeMark> = {}): ShapeMark => ({
  id: "s",
  kind: "shape",
  page: 1,
  shape: "rectangle",
  x: 100,
  y: 100,
  widthPt: 80,
  heightPt: 40,
  rotation: 0,
  ...extra,
});

const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe("shape outlines", () => {
  it("draws a rectangle on its box and turns it about the center", () => {
    const flat = shapeOutline(box())!;
    expect(flat.points).toEqual([
      { x: 100, y: 100 },
      { x: 180, y: 100 },
      { x: 180, y: 140 },
      { x: 100, y: 140 },
    ]);
    const turned = shapeOutline(box({ rotation: 90 }))!;
    near(turned.points[0]!.x, 160);
    near(turned.points[0]!.y, 80);
  });

  it("makes polygons, stars and an open bracket", () => {
    expect(shapeOutline(box({ shape: "polygon", sides: 5 }))!.points).toHaveLength(5);
    expect(shapeOutline(box({ shape: "star", points: 6 }))!.points).toHaveLength(12);
    expect(shapeOutline(box({ shape: "bracket" }))!.closed).toBe(false);
    expect(shapeOutline(box({ shape: "stamp" }))).toBeNull();
  });
});

describe("shape handles", () => {
  it("resizes from a corner and keeps the opposite corner fixed", () => {
    const next = resizeShape(box(), { sx: 1, sy: 1 }, { x: 200, y: 160 }, false);
    expect(next).toMatchObject({ x: 100, y: 100, widthPt: 100, heightPt: 60 });
  });

  it("keeps the proportions when asked", () => {
    const next = resizeShape(box(), { sx: 1, sy: 1 }, { x: 260, y: 150 }, true);
    expect(next.widthPt / next.heightPt).toBeCloseTo(2);
  });

  it("resizes a rotated shape along its own sides", () => {
    const turned = box({ rotation: 90 });
    // The right-hand handle of a quarter-turned box sits below the center.
    const right = shapeHandles(turned, 20).find((h) => h.handle.kind === "resize" && h.handle.sx === 1 && h.handle.sy === 0)!;
    near(right.at.x, 140);
    near(right.at.y, 160);
    const next = resizeShape(turned, { sx: 1, sy: 0 }, { x: 140, y: 180 }, false);
    near(next.widthPt, 100);
    near(next.heightPt, 40);
  });

  it("points the top at the pointer and snaps", () => {
    expect(rotationToward(box(), { x: 240, y: 120 }, 15)).toBe(90);
    expect(hitsShape(box(), { x: 150, y: 120 }, 0)).toBe(true);
    expect(hitsShape(box(), { x: 300, y: 120 }, 4)).toBe(false);
  });
});

describe("pen and polygon paths", () => {
  it("thins a freehand stroke but keeps its corners", () => {
    const points = [
      ...Array.from({ length: 50 }, (_, i) => ({ x: i, y: 0.1 * Math.sin(i) })),
      ...Array.from({ length: 50 }, (_, i) => ({ x: 49, y: i })),
    ];
    const simple = simplifyPoints(points, 0.5);
    expect(simple.length).toBeLessThan(6);
    expect(simple).toContainEqual({ x: 49, y: expect.closeTo(0.1 * Math.sin(49), 6) });
  });

  it("stores corners inside the box, so the box handles move and stretch them", () => {
    const box = pathBox([
      { x: 100, y: 100 },
      { x: 200, y: 150 },
      { x: 100, y: 200 },
    ]);
    expect(box).toMatchObject({ x: 100, y: 100, widthPt: 100, heightPt: 100 });
    const shape = box_(box, true);
    expect(shapeOutline(shape)!.points[1]).toEqual({ x: 200, y: 150 });
    const wider = shapeOutline({ ...shape, widthPt: 200 })!;
    expect(wider.points[1]).toEqual({ x: 300, y: 150 });
    expect(shapeOutline(shape)!.closed).toBe(true);
  });
});

function box_(b: ReturnType<typeof pathBox>, closed: boolean): ShapeMark {
  return { id: "p", kind: "shape", page: 1, shape: "path", x: b.x, y: b.y, widthPt: b.widthPt, heightPt: b.heightPt, rotation: 0, path: { points: b.path, closed } };
}

describe("outlines", () => {
  it("draws a halo for shapes with an outline, but never under a highlight", () => {
    const outline = { color: "#FFFFFF", widthPt: 2 };
    expect(shapeHalo(box({ outline }))).toEqual(outline);
    expect(shapeHalo(box())).toBeNull();
    expect(shapeHalo(box({ shape: "highlight", outline }))).toBeNull();
  });
});
