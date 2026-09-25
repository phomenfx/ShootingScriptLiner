/** App chrome theme. Does not affect PDF pixels, annotations, or exports. */
export const COLOR_THEMES = ["dark", "light"] as const;

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

/** Right sidebar (properties + outliner) width. */
export const DEFAULT_SIDEBAR_WIDTH_PX = 420;

export const MIN_SIDEBAR_WIDTH_PX = 280;

/** Sidebar may take at most this fraction of the window width. */
export const MAX_SIDEBAR_WIDTH_RATIO = 0.75;

/** Properties panel height inside the sidebar. */
export const DEFAULT_PROPERTIES_HEIGHT_PX = 320;

export const MIN_PROPERTIES_HEIGHT_PX = 120;

/** Shot list keeps at least this much height below the properties panel. */
export const MIN_OUTLINER_HEIGHT_PX = 140;

export const PROPERTIES_SPLITTER_PX = 5;

/** Properties panel may take at most this fraction of the sidebar height. */
export const MAX_PROPERTIES_HEIGHT_RATIO = 0.75;
