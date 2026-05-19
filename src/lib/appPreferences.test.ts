import { describe, expect, it } from "vitest";
import { clampLineHitTolerancePx } from "./appPreferences";
import {
  DEFAULT_LINE_HIT_TOLERANCE_PX,
  MAX_LINE_HIT_TOLERANCE_PX,
  MIN_LINE_HIT_TOLERANCE_PX,
} from "../types/appPreferences";

describe("clampLineHitTolerancePx", () => {
  it("returns default for invalid input", () => {
    expect(clampLineHitTolerancePx(NaN)).toBe(DEFAULT_LINE_HIT_TOLERANCE_PX);
  });

  it("clamps to min and max", () => {
    expect(clampLineHitTolerancePx(4)).toBe(MIN_LINE_HIT_TOLERANCE_PX);
    expect(clampLineHitTolerancePx(99)).toBe(MAX_LINE_HIT_TOLERANCE_PX);
  });

  it("rounds valid values", () => {
    expect(clampLineHitTolerancePx(20.7)).toBe(21);
  });
});
