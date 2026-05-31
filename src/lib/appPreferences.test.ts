import { describe, expect, it } from "vitest";
import { clampLineHitTolerancePx, clampMaxMountedPdfPages, clampViewerZoomPercent } from "./appPreferences";
import {
  DEFAULT_LINE_HIT_TOLERANCE_PX,
  DEFAULT_MAX_MOUNTED_PDF_PAGES,
  DEFAULT_VIEWER_ZOOM_PERCENT,
  MAX_LINE_HIT_TOLERANCE_PX,
  MAX_MAX_MOUNTED_PDF_PAGES,
  MAX_VIEWER_ZOOM_PERCENT,
  MIN_LINE_HIT_TOLERANCE_PX,
  MIN_MAX_MOUNTED_PDF_PAGES,
  MIN_VIEWER_ZOOM_PERCENT,
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

describe("clampMaxMountedPdfPages", () => {
  it("returns default for invalid input", () => {
    expect(clampMaxMountedPdfPages(NaN)).toBe(DEFAULT_MAX_MOUNTED_PDF_PAGES);
  });

  it("clamps to min and max", () => {
    expect(clampMaxMountedPdfPages(1)).toBe(MIN_MAX_MOUNTED_PDF_PAGES);
    expect(clampMaxMountedPdfPages(99)).toBe(MAX_MAX_MOUNTED_PDF_PAGES);
  });

  it("rounds valid values", () => {
    expect(clampMaxMountedPdfPages(12.4)).toBe(12);
  });
});

describe("clampViewerZoomPercent", () => {
  it("returns default for invalid input", () => {
    expect(clampViewerZoomPercent(NaN)).toBe(DEFAULT_VIEWER_ZOOM_PERCENT);
  });

  it("clamps to min and max", () => {
    expect(clampViewerZoomPercent(10)).toBe(MIN_VIEWER_ZOOM_PERCENT);
    expect(clampViewerZoomPercent(500)).toBe(MAX_VIEWER_ZOOM_PERCENT);
  });

  it("rounds valid values", () => {
    expect(clampViewerZoomPercent(130.6)).toBe(131);
  });
});
