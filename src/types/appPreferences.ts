/** App chrome theme. `system` follows the device setting. Does not affect PDF pixels, annotations, or exports. */
export const COLOR_THEMES = ["dark", "system", "light"] as const;

export type ColorTheme = (typeof COLOR_THEMES)[number];

export const DEFAULT_COLOR_THEME: ColorTheme = "dark";

/** Default perpendicular click slop for selecting lines (Select tool). */
export const DEFAULT_LINE_HIT_TOLERANCE_PX = 12;

export const MIN_LINE_HIT_TOLERANCE_PX = 8;
export const MAX_LINE_HIT_TOLERANCE_PX = 32;

/** Max PDF page stacks mounted at once in scroll view (culling). */
export const DEFAULT_MAX_MOUNTED_PDF_PAGES = 10;

export const MIN_MAX_MOUNTED_PDF_PAGES = 3;
export const MAX_MAX_MOUNTED_PDF_PAGES = 30;

/** PDF viewer zoom as percent (100 = fit spread page size at current pane width). */
export const DEFAULT_VIEWER_ZOOM_PERCENT = 100;

export const MIN_VIEWER_ZOOM_PERCENT = 25;
export const MAX_VIEWER_ZOOM_PERCENT = 400;

export const VIEWER_ZOOM_STEP_PERCENT = 10;

/** Size of the app chrome as a percent. The script page has its own zoom. */
export const UI_SCALES = [90, 100, 110, 125] as const;

export type UiScale = (typeof UI_SCALES)[number];

export const DEFAULT_UI_SCALE: UiScale = 100;
