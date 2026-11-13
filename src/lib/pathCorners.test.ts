import { describe, expect, it } from "vitest";
import type { ShapeMark } from "../model/types";
import { moveCorner, pathCorners, refitPath } from "./shapeGeometry";

const tri = (rotation: number): ShapeMark =>
  ({
    id: "s",
    kind: "shape",
    page: 1,
    shape: "path",
    x: 100,
    y: 100,
    widthPt: 100,
    heightPt: 50,
    rotation,
    path: { points: [{ x: 0, y: 1 }, { x: 0.5, y: 0 }, { x: 1, y: 1 }], closed: true },
  }) as ShapeMark;

describe("moving one corner of a path", () => {
  for (const rotation of [0, 30]) {
    it(`moves only that corner and refits the box (rotated ${rotation}°)`, () => {
      const shape = tri(rotation);
      const before = pathCorners(shape);
      const target = { x: before[1]!.x + 40, y: before[1]!.y - 30 };
      const moved = refitPath(moveCorner(shape, 1, target));
      const after = pathCorners(moved);
      expect(after[1]!.x).toBeCloseTo(target.x);
      expect(after[1]!.y).toBeCloseTo(target.y);
      for (const i of [0, 2]) {
        expect(after[i]!.x).toBeCloseTo(before[i]!.x);
        expect(after[i]!.y).toBeCloseTo(before[i]!.y);
      }
      // Every point sits inside the new box again.
      for (const p of moved.path!.points) {
        expect(p.x).toBeGreaterThanOrEqual(-1e-9);
        expect(p.x).toBeLessThanOrEqual(1 + 1e-9);
        expect(p.y).toBeGreaterThanOrEqual(-1e-9);
        expect(p.y).toBeLessThanOrEqual(1 + 1e-9);
      }
    });
  }
});
