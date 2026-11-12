import { describe, expect, it } from "vitest";
import { shiftActionBar } from "./actionBarLayout";

describe("shiftActionBar", () => {
  it("keeps a dragged bar on the page", () => {
    const placed = shiftActionBar({ left: 20, top: 20 }, { x: -100, y: 500 }, 200, 100, 40, 20);
    expect(placed.left).toBe(4);
    expect(placed.top).toBe(76);
  });

  it("follows the drag when there is room", () => {
    expect(shiftActionBar({ left: 40, top: 30 }, { x: 12, y: -8 }, 400, 400)).toEqual({
      left: 52,
      top: 22,
    });
  });
});
