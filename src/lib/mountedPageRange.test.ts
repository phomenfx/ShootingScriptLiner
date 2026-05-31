import { describe, expect, it } from "vitest";
import { computeMountedPageRange } from "./mountedPageRange";

describe("computeMountedPageRange", () => {
  const stride = 1000;

  it("includes page 1 at scroll top with small max", () => {
    const { start, end } = computeMountedPageRange(0, 5000, 100, stride, 3);
    expect(start).toBe(1);
    expect(end).toBe(3);
  });

  it("includes page 1 at scroll top with tall viewport", () => {
    const { start, end } = computeMountedPageRange(0, 800, 100, stride, 3);
    expect(start).toBe(1);
    expect(end).toBe(3);
  });

  it("tracks scrolled position when max is small", () => {
    const { start, end } = computeMountedPageRange(5000, 800, 100, stride, 3);
    expect(start).toBe(4);
    expect(end).toBe(6);
    expect(end - start + 1).toBe(3);
  });

  it("never exceeds max mounted pages", () => {
    const { start, end } = computeMountedPageRange(0, 5000, 100, stride, 5);
    expect(end - start + 1).toBeLessThanOrEqual(5);
  });
});
