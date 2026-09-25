import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clampLineHitTolerancePx,
  clampMaxMountedPdfPages,
  clampPropertiesHeightPx,
  clampSidebarWidthPx,
  clampViewerZoomPercent,
  loadColorTheme,
  normalizeColorTheme,
  saveColorTheme,
} from "./appPreferences";
import {
  DEFAULT_COLOR_THEME,
  DEFAULT_LINE_HIT_TOLERANCE_PX,
  DEFAULT_MAX_MOUNTED_PDF_PAGES,
  DEFAULT_PROPERTIES_HEIGHT_PX,
  DEFAULT_SIDEBAR_WIDTH_PX,
  DEFAULT_VIEWER_ZOOM_PERCENT,
  MAX_LINE_HIT_TOLERANCE_PX,
  MAX_MAX_MOUNTED_PDF_PAGES,
  MAX_SIDEBAR_WIDTH_RATIO,
  MAX_VIEWER_ZOOM_PERCENT,
  MIN_LINE_HIT_TOLERANCE_PX,
  MIN_MAX_MOUNTED_PDF_PAGES,
  MIN_PROPERTIES_HEIGHT_PX,
  MIN_SIDEBAR_WIDTH_PX,
  MIN_VIEWER_ZOOM_PERCENT,
} from "../types/appPreferences";

describe("loadColorTheme", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubStorage(initial: Record<string, string> = {}) {
    const mem = { ...initial };
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => (key in mem ? mem[key] : null),
      setItem: (key: string, value: string) => {
        mem[key] = value;
      },
    });
    return mem;
  }

  it("falls back to dark for an unknown stored value", () => {
    const mem = stubStorage();
    saveColorTheme("light");
    const key = Object.keys(mem)[0];
    mem[key] = "sepia";
    expect(loadColorTheme()).toBe("dark");
    expect(normalizeColorTheme(null)).toBe(DEFAULT_COLOR_THEME);
  });

  it("keeps dark and light", () => {
    const mem = stubStorage();
    saveColorTheme("light");
    expect(loadColorTheme()).toBe("light");
    saveColorTheme("dark");
    expect(loadColorTheme()).toBe("dark");
    expect(Object.values(mem)).toContain("dark");
  });
});

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

describe("clampSidebarWidthPx", () => {
  it("returns default for invalid input", () => {
    expect(clampSidebarWidthPx(NaN)).toBe(DEFAULT_SIDEBAR_WIDTH_PX);
  });

  it("clamps to min when no viewport is given", () => {
    expect(clampSidebarWidthPx(100)).toBe(MIN_SIDEBAR_WIDTH_PX);
    expect(clampSidebarWidthPx(900)).toBe(900);
  });

  it("caps at 75% of the viewport width", () => {
    expect(clampSidebarWidthPx(9999, 1000)).toBe(1000 * MAX_SIDEBAR_WIDTH_RATIO);
  });

  it("rounds valid values", () => {
    expect(clampSidebarWidthPx(400.6, 2000)).toBe(401);
  });
});

describe("clampPropertiesHeightPx", () => {
  it("returns default for invalid input", () => {
    expect(clampPropertiesHeightPx(NaN)).toBe(DEFAULT_PROPERTIES_HEIGHT_PX);
  });

  it("clamps to min when no pane height is given", () => {
    expect(clampPropertiesHeightPx(40)).toBe(MIN_PROPERTIES_HEIGHT_PX);
    expect(clampPropertiesHeightPx(900)).toBe(900);
  });

  it("leaves room for the shot list and stays within 75% of the pane", () => {
    expect(clampPropertiesHeightPx(9999, 800)).toBe(600);
    expect(clampPropertiesHeightPx(9999, 400)).toBe(255);
  });

  it("rounds valid values", () => {
    expect(clampPropertiesHeightPx(240.6, 800)).toBe(241);
  });
});
