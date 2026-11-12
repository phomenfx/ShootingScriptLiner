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
  DEFAULT_UI_SCALE,
  UI_SCALES,
  type ColorTheme,
  type UiScale,
} from "../types/appPreferences";


export function normalizeColorTheme(value: unknown): ColorTheme {
  return value === "light" || value === "system" ? value : DEFAULT_COLOR_THEME;
}

/** The theme actually shown: `system` becomes dark or light from the device setting. */
export function resolveColorTheme(theme: ColorTheme, prefersLight: boolean): "dark" | "light" {
  if (theme === "system") return prefersLight ? "light" : "dark";
  return theme;
}

function devicePrefersLight(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: light)").matches;
}

/** Paint the chrome theme. No effect on PDF or exports. */
export function applyColorTheme(theme: ColorTheme): void {
  if (typeof document === "undefined") return;
  const shown = resolveColorTheme(normalizeColorTheme(theme), devicePrefersLight());
  document.documentElement.dataset.theme = shown;
  document.documentElement.style.colorScheme = shown;
}

export function normalizeUiScale(value: unknown): UiScale {
  return (UI_SCALES as readonly number[]).includes(Number(value)) ? (Number(value) as UiScale) : DEFAULT_UI_SCALE;
}

/** Chrome sizes are in rem, so the root font size scales the whole interface. */
export function applyUiScale(scale: UiScale): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.fontSize = `${normalizeUiScale(scale)}%`;
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

