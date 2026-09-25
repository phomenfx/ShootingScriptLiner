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
import type { ViewerLayoutMode } from "../types/viewerLayout";
import { VIEWER_LAYOUT_MODES } from "../types/viewerLayout";

const STORAGE_KEY = "shooting-script-liner-line-hit-tolerance";
const COLOR_THEME_KEY = "shooting-script-liner-color-theme";
const LAYOUT_MODE_KEY = "shooting-script-liner-viewer-layout";
const MAX_MOUNTED_PAGES_KEY = "shooting-script-liner-max-mounted-pdf-pages";
const VIEWER_ZOOM_KEY = "shooting-script-liner-viewer-zoom-percent";
const SIDEBAR_WIDTH_KEY = "shooting-script-liner-sidebar-width-px";
const PROPERTIES_HEIGHT_KEY = "shooting-script-liner-properties-height-px";

export function normalizeColorTheme(value: unknown): ColorTheme {
  return value === "light" ? "light" : DEFAULT_COLOR_THEME;
}

export function loadColorTheme(): ColorTheme {
  try {
    return normalizeColorTheme(localStorage.getItem(COLOR_THEME_KEY));
  } catch {
    return DEFAULT_COLOR_THEME;
  }
}

export function saveColorTheme(theme: ColorTheme): void {
  localStorage.setItem(COLOR_THEME_KEY, normalizeColorTheme(theme));
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

export function loadLineHitTolerancePx(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null || raw === "") return DEFAULT_LINE_HIT_TOLERANCE_PX;
    return clampLineHitTolerancePx(Number(raw));
  } catch {
    return DEFAULT_LINE_HIT_TOLERANCE_PX;
  }
}

export function saveLineHitTolerancePx(px: number): void {
  localStorage.setItem(STORAGE_KEY, String(clampLineHitTolerancePx(px)));
}

export function loadViewerLayoutMode(): ViewerLayoutMode {
  try {
    const raw = localStorage.getItem(LAYOUT_MODE_KEY);
    if (raw && VIEWER_LAYOUT_MODES.includes(raw as ViewerLayoutMode)) {
      return raw as ViewerLayoutMode;
    }
  } catch {
    /* ignore */
  }
  return "single";
}

export function saveViewerLayoutMode(mode: ViewerLayoutMode): void {
  localStorage.setItem(LAYOUT_MODE_KEY, mode);
}

export function clampMaxMountedPdfPages(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_MAX_MOUNTED_PDF_PAGES;
  return Math.round(
    Math.max(MIN_MAX_MOUNTED_PDF_PAGES, Math.min(MAX_MAX_MOUNTED_PDF_PAGES, n))
  );
}

export function loadMaxMountedPdfPages(): number {
  try {
    const raw = localStorage.getItem(MAX_MOUNTED_PAGES_KEY);
    if (raw == null || raw === "") return DEFAULT_MAX_MOUNTED_PDF_PAGES;
    return clampMaxMountedPdfPages(Number(raw));
  } catch {
    return DEFAULT_MAX_MOUNTED_PDF_PAGES;
  }
}

export function saveMaxMountedPdfPages(count: number): void {
  localStorage.setItem(MAX_MOUNTED_PAGES_KEY, String(clampMaxMountedPdfPages(count)));
}

export function clampViewerZoomPercent(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_VIEWER_ZOOM_PERCENT;
  return Math.round(
    Math.max(MIN_VIEWER_ZOOM_PERCENT, Math.min(MAX_VIEWER_ZOOM_PERCENT, n))
  );
}

export function loadViewerZoomPercent(): number {
  try {
    const raw = localStorage.getItem(VIEWER_ZOOM_KEY);
    if (raw == null || raw === "") return DEFAULT_VIEWER_ZOOM_PERCENT;
    return clampViewerZoomPercent(Number(raw));
  } catch {
    return DEFAULT_VIEWER_ZOOM_PERCENT;
  }
}

export function saveViewerZoomPercent(percent: number): void {
  localStorage.setItem(VIEWER_ZOOM_KEY, String(clampViewerZoomPercent(percent)));
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

export function loadSidebarWidthPx(): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (raw == null || raw === "") return DEFAULT_SIDEBAR_WIDTH_PX;
    const viewport =
      typeof window !== "undefined" && Number.isFinite(window.innerWidth)
        ? window.innerWidth
        : undefined;
    return clampSidebarWidthPx(Number(raw), viewport);
  } catch {
    return DEFAULT_SIDEBAR_WIDTH_PX;
  }
}

export function saveSidebarWidthPx(px: number): void {
  const viewport =
    typeof window !== "undefined" && Number.isFinite(window.innerWidth)
      ? window.innerWidth
      : undefined;
  localStorage.setItem(SIDEBAR_WIDTH_KEY, String(clampSidebarWidthPx(px, viewport)));
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

export function loadPropertiesHeightPx(): number {
  try {
    const raw = localStorage.getItem(PROPERTIES_HEIGHT_KEY);
    if (raw == null || raw === "") return DEFAULT_PROPERTIES_HEIGHT_PX;
    const paneHeight =
      typeof window !== "undefined" && Number.isFinite(window.innerHeight)
        ? window.innerHeight
        : undefined;
    return clampPropertiesHeightPx(Number(raw), paneHeight);
  } catch {
    return DEFAULT_PROPERTIES_HEIGHT_PX;
  }
}

export function savePropertiesHeightPx(px: number, paneHeight?: number): void {
  localStorage.setItem(PROPERTIES_HEIGHT_KEY, String(clampPropertiesHeightPx(px, paneHeight)));
}
