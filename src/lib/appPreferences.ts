import {
  DEFAULT_COLOR_THEME,
  DEFAULT_LINE_HIT_TOLERANCE_PX,
  DEFAULT_MAX_MOUNTED_PDF_PAGES,
  DEFAULT_PROPERTIES_HEIGHT_PX,
  DEFAULT_SIDEBAR_WIDTH_PX,
  DEFAULT_VIEWER_ZOOM_PERCENT,
  MAX_LINE_HIT_TOLERANCE_PX,
  MAX_MAX_MOUNTED_PDF_PAGES,
  MAX_PROPERTIES_HEIGHT_RATIO,
  MAX_SIDEBAR_WIDTH_RATIO,
  MAX_VIEWER_ZOOM_PERCENT,
  MIN_LINE_HIT_TOLERANCE_PX,
  MIN_MAX_MOUNTED_PDF_PAGES,
  MIN_OUTLINER_HEIGHT_PX,
  MIN_PROPERTIES_HEIGHT_PX,
  MIN_SIDEBAR_WIDTH_PX,
  MIN_VIEWER_ZOOM_PERCENT,
  PROPERTIES_SPLITTER_PX,
  type ColorTheme,
} from "../types/appPreferences";


export function normalizeColorTheme(value: unknown): ColorTheme {
  return value === "light" ? "light" : DEFAULT_COLOR_THEME;
}

/** Paint the chrome theme before React renders. No effect on PDF or exports. */
export function applyColorTheme(theme: ColorTheme): void {
  if (typeof document === "undefined") return;
  const next = normalizeColorTheme(theme);
  document.documentElement.dataset.theme = next;
  document.documentElement.style.colorScheme = next;
}

export function clampLineHitTolerancePx(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_LINE_HIT_TOLERANCE_PX;
  return Math.round(Math.max(MIN_LINE_HIT_TOLERANCE_PX, Math.min(MAX_LINE_HIT_TOLERANCE_PX, n)));
}

export function clampMaxMountedPdfPages(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_MAX_MOUNTED_PDF_PAGES;
  return Math.round(
    Math.max(MIN_MAX_MOUNTED_PDF_PAGES, Math.min(MAX_MAX_MOUNTED_PDF_PAGES, n))
  );
}

export function clampViewerZoomPercent(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_VIEWER_ZOOM_PERCENT;
  return Math.round(
    Math.max(MIN_VIEWER_ZOOM_PERCENT, Math.min(MAX_VIEWER_ZOOM_PERCENT, n))
  );
}

export function clampSidebarWidthPx(value: number, viewportWidth?: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SIDEBAR_WIDTH_PX;
  const rounded = Math.round(Math.max(MIN_SIDEBAR_WIDTH_PX, n));
  if (viewportWidth == null || !Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    return rounded;
  }
  const max = Math.max(MIN_SIDEBAR_WIDTH_PX, viewportWidth * MAX_SIDEBAR_WIDTH_RATIO);
  return Math.round(Math.min(max, rounded));
}

export function clampPropertiesHeightPx(value: number, paneHeight?: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_PROPERTIES_HEIGHT_PX;
  const rounded = Math.round(Math.max(MIN_PROPERTIES_HEIGHT_PX, n));
  if (paneHeight == null || !Number.isFinite(paneHeight) || paneHeight <= 0) return rounded;
  const ratioMax = paneHeight * MAX_PROPERTIES_HEIGHT_RATIO;
  const roomMax = paneHeight - MIN_OUTLINER_HEIGHT_PX - PROPERTIES_SPLITTER_PX;
  const max = Math.max(MIN_PROPERTIES_HEIGHT_PX, Math.min(ratioMax, roomMax));
  return Math.round(Math.min(max, rounded));
}

