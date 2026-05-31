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
import type { ViewerLayoutMode } from "../types/viewerLayout";
import { VIEWER_LAYOUT_MODES } from "../types/viewerLayout";

const STORAGE_KEY = "shooting-script-liner-line-hit-tolerance";
const LAYOUT_MODE_KEY = "shooting-script-liner-viewer-layout";
const MAX_MOUNTED_PAGES_KEY = "shooting-script-liner-max-mounted-pdf-pages";
const VIEWER_ZOOM_KEY = "shooting-script-liner-viewer-zoom-percent";

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
