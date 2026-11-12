import {
  DEFAULT_COLOR_THEME,
  DEFAULT_LINE_HIT_TOLERANCE_PX,
  DEFAULT_MAX_MOUNTED_PDF_PAGES,
  DEFAULT_VIEWER_ZOOM_PERCENT,
  MAX_LINE_HIT_TOLERANCE_PX,
  MAX_MAX_MOUNTED_PDF_PAGES,
  MAX_VIEWER_ZOOM_PERCENT,
  MIN_LINE_HIT_TOLERANCE_PX,
  MIN_MAX_MOUNTED_PDF_PAGES,
  MIN_VIEWER_ZOOM_PERCENT,
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

