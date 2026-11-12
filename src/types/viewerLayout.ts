export type ViewerLayoutMode = "single" | "scroll" | "spread";

export const VIEWER_LAYOUT_MODES: ViewerLayoutMode[] = ["single", "scroll", "spread"];

export const VIEWER_LAYOUT_LABELS: Record<ViewerLayoutMode, string> = {
  single: "Single page",
  scroll: "Continuous scroll",
  spread: "Book spread",
};

/** Short names for the script bar's view picker. */
export const VIEWER_LAYOUT_SHORT: Record<ViewerLayoutMode, string> = {
  single: "Single",
  scroll: "Scroll",
  spread: "Book",
};
