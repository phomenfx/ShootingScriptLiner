import { describe, expect, it } from "vitest";
import { fromPoints, toPoints } from "./units";

describe("length units", () => {
  it("show points as inches or millimeters and back", () => {
    expect(fromPoints(72, "in")).toBe(1);
    expect(fromPoints(72, "mm")).toBe(25.4);
    expect(toPoints(1, "in")).toBe(72);
    expect(toPoints(25.4, "mm")).toBeCloseTo(72);
    expect(fromPoints(1.5, "pt")).toBe(1.5);
  });
});
