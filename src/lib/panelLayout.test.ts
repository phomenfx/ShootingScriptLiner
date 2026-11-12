import { describe, expect, it } from "vitest";
import {
  DEFAULT_PANEL_WIDTH_PX,
  MAX_PANEL_WIDTH_PX,
  MIN_PANEL_WIDTH_PX,
  clampPanelWidthPx,
  draggedPanelWidthPx,
  panelSides,
} from "./panelLayout";

describe("panelLayout", () => {
  it("keeps widths between the minimum and maximum", () => {
    expect(clampPanelWidthPx("scenes", 10)).toBe(MIN_PANEL_WIDTH_PX);
    expect(clampPanelWidthPx("scenes", 5000)).toBe(MAX_PANEL_WIDTH_PX);
    expect(clampPanelWidthPx("scenes", 333.4)).toBe(333);
    expect(clampPanelWidthPx("properties", Number.NaN)).toBe(DEFAULT_PANEL_WIDTH_PX.properties);
  });

  it("limits a panel to 40% of the window, but never below the minimum", () => {
    expect(clampPanelWidthPx("scenes", 600, 1000)).toBe(400);
    expect(clampPanelWidthPx("scenes", 600, 500)).toBe(MIN_PANEL_WIDTH_PX);
  });

  it("puts Properties left and Scenes right unless swapped", () => {
    expect(panelSides(false)).toEqual({ left: "properties", right: "scenes" });
    expect(panelSides(true)).toEqual({ left: "scenes", right: "properties" });
  });

  it("grows the left panel when dragged right and the right panel when dragged left", () => {
    expect(draggedPanelWidthPx("left", 300, 100, 150)).toBe(350);
    expect(draggedPanelWidthPx("right", 300, 100, 150)).toBe(250);
    expect(draggedPanelWidthPx("right", 300, 100, 40)).toBe(360);
  });
});
