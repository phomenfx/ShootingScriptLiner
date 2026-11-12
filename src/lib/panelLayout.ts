/** Sizes and rules for the two side panels of the three-column layout. */

export type SidePanel = "properties" | "scenes";

/** Where a panel sits. Only `docked` exists on desktop; the others are for the tablet layouts. */
export type PanelPlacement = "docked" | "overlay" | "sheet";

export type PanelPrefs = {
  widthPx: Record<SidePanel, number>;
  collapsed: Record<SidePanel, boolean>;
  placement: Record<SidePanel, PanelPlacement>;
  /** Off: Properties left, Scenes right. On: the other way round. */
  swapSides: boolean;
};

export const DEFAULT_PANEL_WIDTH_PX: Record<SidePanel, number> = { properties: 300, scenes: 320 };
export const MIN_PANEL_WIDTH_PX = 240;
export const MAX_PANEL_WIDTH_PX = 640;
/** One side panel may take at most this share of the window. */
export const MAX_PANEL_WIDTH_RATIO = 0.4;
/** Width of a collapsed panel's strip. */
export const COLLAPSED_PANEL_WIDTH_PX = 34;

export function defaultPanelPrefs(): PanelPrefs {
  return {
    widthPx: { ...DEFAULT_PANEL_WIDTH_PX },
    collapsed: { properties: false, scenes: false },
    placement: { properties: "docked", scenes: "docked" },
    swapSides: false,
  };
}

export function clampPanelWidthPx(panel: SidePanel, value: number, viewportWidth?: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_PANEL_WIDTH_PX[panel];
  let max = MAX_PANEL_WIDTH_PX;
  if (viewportWidth && Number.isFinite(viewportWidth) && viewportWidth > 0) {
    max = Math.max(MIN_PANEL_WIDTH_PX, Math.min(max, viewportWidth * MAX_PANEL_WIDTH_RATIO));
  }
  return Math.round(Math.max(MIN_PANEL_WIDTH_PX, Math.min(max, n)));
}

/** Which panel is on which side. */
export function panelSides(swapSides: boolean): { left: SidePanel; right: SidePanel } {
  return swapSides
    ? { left: "scenes", right: "properties" }
    : { left: "properties", right: "scenes" };
}

/**
 * New width while dragging a panel's inner edge. The left panel grows when the
 * pointer moves right; the right panel grows when it moves left.
 */
export function draggedPanelWidthPx(
  side: "left" | "right",
  startWidthPx: number,
  startX: number,
  currentX: number
): number {
  const delta = currentX - startX;
  return startWidthPx + (side === "left" ? delta : -delta);
}
