/**
 * Preferences saved in this browser: theme, panel sizes, zoom, shortcuts.
 * Never part of a project file.
 */
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import {
  applyColorTheme,
  applyUiScale,
  clampLineHitTolerancePx,
  clampMaxMountedPdfPages,
  clampViewerZoomPercent,
  normalizeColorTheme,
  normalizeUiScale,
} from "../lib/appPreferences";
import {
  clampPanelWidthPx,
  DEFAULT_PANEL_WIDTH_PX,
  defaultPanelPrefs,
  type PanelPrefs,
  type SidePanel,
} from "../lib/panelLayout";
import { sanitizeToolKeybinds, validateToolKeybindChange } from "../lib/toolKeybinds";
import type { ScriptTool } from "../types/annotations";
import {
  DEFAULT_COLOR_THEME,
  DEFAULT_LINE_HIT_TOLERANCE_PX,
  DEFAULT_MAX_MOUNTED_PDF_PAGES,
  DEFAULT_UI_SCALE,
  DEFAULT_VIEWER_ZOOM_PERCENT,
  type ColorTheme,
  type UiScale,
} from "../types/appPreferences";
import { DEFAULT_TOOL_KEYBINDS, type ToolKeybinds } from "../types/toolKeybinds";
import { VIEWER_LAYOUT_MODES, type ViewerLayoutMode } from "../types/viewerLayout";

export const PREFS_STORAGE_KEY = "shooting-script-liner-prefs";

type PrefsValues = {
  colorTheme: ColorTheme;
  uiScale: UiScale;
  /** Ask before deleting a scene or shot that has lines. */
  confirmDeletes: boolean;
  viewerLayoutMode: ViewerLayoutMode;
  toolKeybinds: ToolKeybinds;
  /** Perpendicular click slop for selecting lines (px). */
  lineHitTolerancePx: number;
  /** Max page stacks mounted in scroll view. */
  maxMountedPdfPages: number;
  /** 100 fits the current view (one page, or the open spread) in the script area. */
  viewerZoomPercent: number;
  /** Bar beside the selected mark: Duplicate, Link, Delete. */
  showActionBar: boolean;
  /** Side panel widths, collapse state and order. */
  panels: PanelPrefs;
  /** Groups folded in the Properties forms, by group name. */
  foldedGroups: Record<string, true>;
  /** Shot list table columns turned off, by column id. */
  hiddenTableColumns: string[];
};

type PrefsState = PrefsValues & {
  setColorTheme: (theme: ColorTheme) => void;
  setUiScale: (scale: UiScale) => void;
  setConfirmDeletes: (ask: boolean) => void;
  resetPanelWidths: () => void;
  setViewerLayoutMode: (mode: ViewerLayoutMode) => void;
  /** Returns an error message, or null when the key was set. */
  setToolKeybind: (tool: ScriptTool, key: string) => string | null;
  resetToolKeybinds: () => void;
  setLineHitTolerancePx: (px: number) => void;
  setMaxMountedPdfPages: (count: number) => void;
  setViewerZoomPercent: (percent: number) => void;
  setShowActionBar: (show: boolean) => void;
  setPanelWidth: (panel: SidePanel, px: number) => void;
  resetPanelWidth: (panel: SidePanel) => void;
  setPanelCollapsed: (panel: SidePanel, collapsed: boolean) => void;
  setSwapSides: (swap: boolean) => void;
  setGroupFolded: (group: string, folded: boolean) => void;
  setTableColumnHidden: (column: string, hidden: boolean) => void;
  showAllTableColumns: () => void;
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
  if (hit !== undefined) out.lineHitTolerancePx = clampLineHitTolerancePx(hit);
  if (mounted !== undefined) out.maxMountedPdfPages = clampMaxMountedPdfPages(mounted);
  if (zoom !== undefined) out.viewerZoomPercent = clampViewerZoomPercent(zoom);
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
      uiScale: DEFAULT_UI_SCALE,
      confirmDeletes: true,
      viewerLayoutMode: "spread",
      toolKeybinds: { ...DEFAULT_TOOL_KEYBINDS },
      lineHitTolerancePx: DEFAULT_LINE_HIT_TOLERANCE_PX,
      maxMountedPdfPages: DEFAULT_MAX_MOUNTED_PDF_PAGES,
      viewerZoomPercent: DEFAULT_VIEWER_ZOOM_PERCENT,
      showActionBar: true,
      panels: defaultPanelPrefs(),
      foldedGroups: {},
      hiddenTableColumns: [],
      ...readOldKeys(),

      setColorTheme: (theme) => {
        const colorTheme = normalizeColorTheme(theme);
        applyColorTheme(colorTheme);
        set({ colorTheme });
      },
      setUiScale: (scale) => {
        const uiScale = normalizeUiScale(scale);
        applyUiScale(uiScale);
        set({ uiScale });
      },
      setConfirmDeletes: (confirmDeletes) => set({ confirmDeletes }),
      resetPanelWidths: () =>
        set((s) => ({ panels: { ...s.panels, widthPx: { ...DEFAULT_PANEL_WIDTH_PX } } })),
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
      setShowActionBar: (showActionBar) => set({ showActionBar }),
      setPanelWidth: (panel, px) =>
        set((s) => ({
          panels: {
            ...s.panels,
            widthPx: { ...s.panels.widthPx, [panel]: clampPanelWidthPx(panel, px, viewportWidth()) },
          },
        })),
      resetPanelWidth: (panel) =>
        set((s) => ({
          panels: {
            ...s.panels,
            widthPx: { ...s.panels.widthPx, [panel]: DEFAULT_PANEL_WIDTH_PX[panel] },
          },
        })),
      setPanelCollapsed: (panel, collapsed) =>
        set((s) => ({
          panels: { ...s.panels, collapsed: { ...s.panels.collapsed, [panel]: collapsed } },
        })),
      setSwapSides: (swapSides) => set((s) => ({ panels: { ...s.panels, swapSides } })),
      setGroupFolded: (group, folded) =>
        set((s) => {
          const foldedGroups = { ...s.foldedGroups };
          if (folded) foldedGroups[group] = true;
          else delete foldedGroups[group];
          return { foldedGroups };
        }),
      showAllTableColumns: () => set({ hiddenTableColumns: [] }),
      setTableColumnHidden: (column, hidden) =>
        set((s) => ({
          hiddenTableColumns: hidden ? [...new Set([...s.hiddenTableColumns, column])] : s.hiddenTableColumns.filter((c) => c !== column),
        })),
    }),
    {
      name: PREFS_STORAGE_KEY,
      version: 1,
      // Saved panel settings may lack parts added later; fill those from the defaults.
      merge: (saved, current) => {
        const s = (saved ?? {}) as Partial<PrefsValues>;
        const d = current.panels;
        return {
          ...current,
          ...s,
          // Tools added later (Shape) get their default key.
          hiddenTableColumns: Array.isArray(s.hiddenTableColumns) ? s.hiddenTableColumns : [],
          toolKeybinds: sanitizeToolKeybinds({ ...DEFAULT_TOOL_KEYBINDS, ...s.toolKeybinds }),
          panels: {
            widthPx: { ...d.widthPx, ...s.panels?.widthPx },
            collapsed: { ...d.collapsed, ...s.panels?.collapsed },
            placement: { ...d.placement, ...s.panels?.placement },
            swapSides: s.panels?.swapSides ?? d.swapSides,
          },
        };
      },
      storage: createJSONStorage(storage),
      partialize: ({
        colorTheme,
        uiScale,
        confirmDeletes,
        viewerLayoutMode,
        toolKeybinds,
        lineHitTolerancePx,
        maxMountedPdfPages,
        viewerZoomPercent,
        showActionBar,
        panels,
        foldedGroups,
        hiddenTableColumns,
      }): PrefsValues => ({
        colorTheme,
        uiScale,
        confirmDeletes,
        viewerLayoutMode,
        toolKeybinds,
        lineHitTolerancePx,
        maxMountedPdfPages,
        viewerZoomPercent,
        showActionBar,
        panels,
        foldedGroups,
        hiddenTableColumns,
      }),
    }
  )
);
