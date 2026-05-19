import { describe, expect, it } from "vitest";
import { clamp01, distance, snapEndpoint } from "./coords";

describe("snapEndpoint", () => {
  it("snaps to horizontal when nearly flat", () => {
    const start = { x: 0.2, y: 0.5 };
    const end = { x: 0.8, y: 0.52 };
    const snapped = snapEndpoint(start, end, 15, false);
    expect(snapped.y).toBe(start.y);
  });

  it("snaps to vertical when nearly upright", () => {
    const start = { x: 0.5, y: 0.2 };
    const end = { x: 0.52, y: 0.9 };
    const snapped = snapEndpoint(start, end, 15, false);
    expect(snapped.x).toBe(start.x);
  });

  it("does not snap when disabled and shift not held", () => {
    const start = { x: 0.2, y: 0.5 };
    const end = { x: 0.8, y: 0.52 };
    expect(snapEndpoint(start, end, 0, false)).toEqual(end);
  });

  it("snaps with shift when snap is off", () => {
    const start = { x: 0.2, y: 0.5 };
    const end = { x: 0.8, y: 0.52 };
    const snapped = snapEndpoint(start, end, 0, true);
    expect(snapped.y).toBe(start.y);
  });
});

describe("clamp01", () => {
  it("clamps values", () => {
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(-0.1)).toBe(0);
  });
});

describe("distance", () => {
  it("computes distance", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});
