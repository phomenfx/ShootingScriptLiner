import { describe, expect, it } from "vitest";
import { customDashKey, customDashLabel, segmentStrands } from "./strokeGeometry";

describe("custom dash patterns", () => {
  it("turn a typed sequence into a pattern name, or refuse", () => {
    expect(customDashKey("8 3 2 3")).toBe("dashed_8_3_2_3");
    expect(customDashKey("6, 2")).toBe("dashed_6_2");
    expect(customDashKey("0 0")).toBeNull();
    expect(customDashKey("a b")).toBeNull();
    expect(customDashKey("1 2 3 4 5 6 7 8 9")).toBeNull();
  });

  it("draw with that dash sequence, scaled by the line width", () => {
    const [strand] = segmentStrands({ x: 0, y: 0 }, { x: 100, y: 0 }, "dashed_8_3_2_3", 2);
    expect(strand!.dash).toEqual([16, 6, 4, 6]);
  });

  it("name custom ones but not the built-in dashed patterns", () => {
    expect(customDashLabel("dashed_8_3_2_3")).toBe("Dashes 8-3-2-3");
    expect(customDashLabel("dashed_4_4")).toBeNull();
    expect(customDashLabel("wavy")).toBeNull();
  });
});
