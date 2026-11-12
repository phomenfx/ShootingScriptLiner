/**
 * Preferences saved in this browser: theme, panel sizes, zoom, shortcuts.
 * Never part of a project file.
 */
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import {
  applyColorTheme,
  clampLineHitTolerancePx,
  clampMaxMountedPdfPages,
  clampPropertiesHeightPx,
  clampSidebarWidthPx,
  clampViewerZoomPercent,
  normalizeColorTheme,
} from "../lib/appPreferences";
import { sanitizeToolKeybinds, validateToolKeybindChange } from "../lib/toolKeybinds";
import type { ScriptTool } from "../types/annotations";
import {
  DEFAULT_COLOR_THEME,
  DEFAULT_LINE_HIT_TOLERANCE_PX,
  DEFAULT_MAX_MOUNTED_PDF_PAGES,
  DEFAULT_PROPERTIES_HEIGHT_PX,
  DEFAULT_SIDEBAR_WIDTH_PX,
  DEFAULT_VIEWER_ZOOM_PERCENT,
  type ColorTheme,
} from "../types/appPreferences";
import { DEFAULT_TOOL_KEYBINDS, type ToolKeybinds } from "../types/toolKeybinds";
import { VIEWER_LAYOUT_MODES, type ViewerLayoutMode } from "../types/viewerLayout";

export const PREFS_STORAGE_KEY = "shooting-script-liner-prefs";

type PrefsValues = {
  colorTheme: ColorTheme;
  viewerLayoutMode: ViewerLayoutMode;
  toolKeybinds: ToolKeybinds;
  /** Perpendicular click slop for selecting lines (px). */
  lineHitTolerancePx: number;
  /** Max page stacks mounted in scroll view. */
  maxMountedPdfPages: number;
  /** 100 = fit. */
  viewerZoomPercent: number;
  sidebarWidthPx: number;
  propertiesHeightPx: number;
};

type PrefsState = PrefsValues & {
  setColorTheme: (theme: ColorTheme) => void;
  setViewerLayoutMode: (mode: ViewerLayoutMode) => void;
  /** Returns an error message, or null when the key was set. */
  setToolKeybind: (tool: ScriptTool, key: string) => string | null;
  resetToolKeybinds: () => void;
  setLineHitTolerancePx: (px: number) => void;
  setMaxMountedPdfPages: (count: number) => void;
  setViewerZoomPercent: (percent: number) => void;
  setSidebarWidthPx: (px: number) => void;
  setPropertiesHeightPx: (px: number, paneHeight?: number) => void;
};

const memory = new Map<string, string>();
const memoryStorage: StateStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => void memory.set(key, value),
  removeItem: (key) => void memory.delete(key),
};

/** The browser's storage, or an in-memory stand-in where there is none (tests, blocked storage). */
function storage(): StateStorage {
  try {
    if (typeof localStorage !== "undefined" && typeof localStorage.getItem === "function") {
      return localStorage;
    }
  } catch {
    /* fall through */
  }
  return memoryStorage;
}

/**
 * Before this store existed each preference had its own storage key. They are
 * read once as starting values, so nobody loses their settings on update.
 */
function readOldKeys(): Partial<PrefsValues> {
  const out: Partial<PrefsValues> = {};
  const read = (suffix: string): string | null => {
    try {
      return storage().getItem(`shooting-script-liner-${suffix}`) as string | null;
    } catch {
      return null;
    }
  };
  const number = (suffix: string) => {
    const raw = read(suffix);
    return raw == null || raw === "" || !Number.isFinite(Number(raw)) ? undefined : Number(raw);
  };
  const theme = read("color-theme");
  if (theme) out.colorTheme = normalizeColorTheme(theme);
  const layout = read("viewer-layout");
  if (layout && VIEWER_LAYOUT_MODES.includes(layout as ViewerLayoutMode)) {
    out.viewerLayoutMode = layout as ViewerLayoutMode;
  }
  try {
    const binds = read("tool-keybinds");
    if (binds) out.toolKeybinds = sanitizeToolKeybinds({ ...DEFAULT_TOOL_KEYBINDS, ...JSON.parse(binds) });
  } catch {
    /* keep defaults */
  }
  const hit = number("line-hit-tolerance");
  const mounted = number("max-mounted-pdf-pages");
  const zoom = number("viewer-zoom-percent");
  const sidebar = number("sidebar-width-px");
  const properties = number("properties-height-px");
  if (hit !== undefined) out.lineHitTolerancePx = clampLineHitTolerancePx(hit);
  if (mounted !== undefined) out.maxMountedPdfPages = clampMaxMountedPdfPages(mounted);
  if (zoom !== undefined) out.viewerZoomPercent = clampViewerZoomPercent(zoom);
  if (sidebar !== undefined) out.sidebarWidthPx = clampSidebarWidthPx(sidebar);
  if (properties !== undefined) out.propertiesHeightPx = clampPropertiesHeightPx(properties);
  return out;
}

function viewportWidth(): number | undefined {
  return typeof window !== "undefined" && Number.isFinite(window.innerWidth)
    ? window.innerWidth
    : undefined;
}

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set, get) => ({
      colorTheme: DEFAULT_COLOR_THEME,
      viewerLayoutMode: "single",
      toolKeybinds: { ...DEFAULT_TOOL_KEYBINDS },
      lineHitTolerancePx: DEFAULT_LINE_HIT_TOLERANCE_PX,
      maxMountedPdfPages: DEFAULT_MAX_MOUNTED_PDF_PAGES,
      viewerZoomPercent: DEFAULT_VIEWER_ZOOM_PERCENT,
      sidebarWidthPx: DEFAULT_SIDEBAR_WIDTH_PX,
      propertiesHeightPx: DEFAULT_PROPERTIES_HEIGHT_PX,
      ...readOldKeys(),

      setColorTheme: (theme) => {
        const colorTheme = normalizeColorTheme(theme);
        applyColorTheme(colorTheme);
        set({ colorTheme });
      },
      setViewerLayoutMode: (viewerLayoutMode) => set({ viewerLayoutMode }),
      setToolKeybind: (tool, key) => {
        const result = validateToolKeybindChange(get().toolKeybinds, tool, key);
        if (!result.ok) return result.reason;
        set({ toolKeybinds: result.next });
        return null;
      },
      resetToolKeybinds: () => set({ toolKeybinds: { ...DEFAULT_TOOL_KEYBINDS } }),
      setLineHitTolerancePx: (px) => set({ lineHitTolerancePx: clampLineHitTolerancePx(px) }),
      setMaxMountedPdfPages: (count) => set({ maxMountedPdfPages: clampMaxMountedPdfPages(count) }),
      setViewerZoomPercent: (percent) => set({ viewerZoomPercent: clampViewerZoomPercent(percent) }),
      setSidebarWidthPx: (px) => set({ sidebarWidthPx: clampSidebarWidthPx(px, viewportWidth()) }),
      setPropertiesHeightPx: (px, paneHeight) =>
        set({ propertiesHeightPx: clampPropertiesHeightPx(px, paneHeight) }),
    }),
    {
      name: PREFS_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(storage),
      partialize: ({
        colorTheme,
        viewerLayoutMode,
        toolKeybinds,
        lineHitTolerancePx,
        maxMountedPdfPages,
        viewerZoomPercent,
        sidebarWidthPx,
        propertiesHeightPx,
      }): PrefsValues => ({
        colorTheme,
        viewerLayoutMode,
        toolKeybinds,
        lineHitTolerancePx,
        maxMountedPdfPages,
        viewerZoomPercent,
        sidebarWidthPx,
        propertiesHeightPx,
      }),
    }
  )
);
