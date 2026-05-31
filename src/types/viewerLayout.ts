export type ViewerLayoutMode = "single" | "scroll" | "spread";

export const VIEWER_LAYOUT_MODES: ViewerLayoutMode[] = ["single", "scroll", "spread"];

export const VIEWER_LAYOUT_LABELS: Record<ViewerLayoutMode, string> = {
  single: "Single page",
  scroll: "Scroll",
  spread: "Two-page",
};
