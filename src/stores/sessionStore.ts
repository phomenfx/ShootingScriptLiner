/**
 * What is going on in this window right now: selection, tool, page, open
 * dialogs, clipboard, the loaded script PDF. None of it is saved.
 */
import type { FindMatch } from "../model/findText";
import type { OutlineClip } from "../model/outlineClipboard";
import { DEFAULT_PDF_OPTIONS, type PdfExportOptions } from "../model/pdfOptions";
import { create } from "zustand";
import type { Mark } from "../model/types";
import type { ScriptTool } from "../types/annotations";
import { usePrefsStore } from "./prefsStore";

/** One or more things of one kind. A single ID until multi-select exists. */
export type Selection = { kind: "scene" | "shot" | "mark"; ids: string[] } | null;

export type ConfirmRequest = {
  message: string;
  /** Gets the checkbox's state when `option` is given. */
  onYes: (checked: boolean) => void;
  /** A checkbox shown under the message. */
  option?: { label: string; checked: boolean };
  /** Names the action on the confirm button, such as "Delete" or "Replace project". */
  confirmLabel?: string;
  /** The action destroys something. */
  danger?: boolean;
};

type SessionState = {
  selection: Selection;
  /** Which tab a linked mark shows in Properties: its own form or its shot's. */
  markTab: "own" | "shot";
  /** One segment of the selected line. Cleared with the selection. Not saved. */
  lineSegment: { lineId: string; index: number } | null;
  /** Scenes folded in the Scenes list. */
  collapsedSceneIds: Record<string, true>;
  activeTool: ScriptTool;
  /** Which shape the Shape tool draws. */
  shapeKind: string;
  /** The Scenes panel as a list, or widened into the shot-list table. */
  scenesView: "list" | "table";
  /** The Import shot list dialog, and a file's text handed to it (a drop on the table). */
  importOpen: boolean;
  /** The Export lined PDF dialog and its choices (kept for the session). */
  pdfExportOpen: boolean;
  pdfOptions: PdfExportOptions;
  shotListPdfOpen: boolean;
  importText: { text: string; name: string } | null;
  /** Shots and scenes hidden from the table for now (Alt+H shows them). Not saved. */
  hiddenTableRows: string[];
  /** Snap button. Shift still snaps while this is off. Not saved with the project. */
  snapEnabled: boolean;
  /** How far the action bar has been dragged from its automatic spot, in page pixels. */
  actionBarOffset: { x: number; y: number };
  /** In-app clipboard for marks. */
  clipboard: Mark[] | null;
  /** Copied shots or scenes from the Scenes list. Only one of the two clipboards is filled. */
  outlineClipboard: OutlineClip | null;
  /** Find on script (Ctrl+F). */
  find: { open: boolean; query: string; matches: FindMatch[]; index: number; busy: boolean };
  setFind: (patch: Partial<SessionState["find"]>) => void;
  /** On a narrow window, the one side panel that is open (null: none). */
  compactPanel: "properties" | "scenes" | null;
  setCompactPanel: (panel: "properties" | "scenes" | null) => void;
  /** A pen has been used here: fingers scroll instead of drawing (Auto setting). */
  stylusSeen: boolean;
  setStylusSeen: (seen: boolean) => void;
  restorePointsOpen: boolean;
  setRestorePointsOpen: (open: boolean) => void;
  settingsOpen: boolean;
  /** Section to show when Settings opens (then cleared). */
  settingsSection: string | null;
  confirm: ConfirmRequest | null;
  /** Messages shown in the page: skipped records, script warnings, errors. */
  notices: string[];
  /** Primary navigation page (1-based); book spread uses the left page. */
  viewerPage: number;
  /** Page that receives paste and the focus outline (1-based). */
  activePage: number;
  pdfPageCount: number;
  /** Height of the active page in points. */
  scriptPageHeightPt: number;
  scriptPdfFile: File | null;

  select: (kind: "scene" | "shot" | "mark", id: string) => void;
  /** Several marks at once (a drag box or Shift/Ctrl-click). An empty list clears. */
  selectMarks: (ids: string[]) => void;
  /** Several shots or scenes (Ctrl- or Shift-click in the Scenes list). */
  selectMany: (kind: "scene" | "shot", ids: string[]) => void;
  clearSelection: () => void;
  setLineSegment: (lineId: string, index: number) => void;
  clearLineSegment: () => void;
  setMarkTab: (tab: "own" | "shot") => void;
  setSceneCollapsed: (sceneId: string, collapsed: boolean) => void;
  setCollapsedScenes: (sceneIds: string[]) => void;
  setActiveTool: (tool: ScriptTool) => void;
  setShapeKind: (kind: string) => void;
  setScenesView: (view: "list" | "table") => void;
  setImportOpen: (open: boolean) => void;
  setPdfExportOpen: (open: boolean) => void;
  setPdfOptions: (options: PdfExportOptions) => void;
  setShotListPdfOpen: (open: boolean) => void;
  setImportText: (file: { text: string; name: string } | null) => void;
  hideTableRow: (id: string) => void;
  showAllTableRows: () => void;
  setSnapEnabled: (on: boolean) => void;
  setActionBarOffset: (offset: { x: number; y: number }) => void;
  setClipboard: (marks: Mark[] | null) => void;
  setOutlineClipboard: (clip: OutlineClip | null) => void;
  setSettingsOpen: (open: boolean, section?: string) => void;
  setConfirm: (confirm: ConfirmRequest | null) => void;
  addNotices: (notices: string[]) => void;
  dismissNotice: (index: number) => void;
  setViewerPage: (page: number) => void;
  setActivePage: (page: number) => void;
  setPdfPageCount: (count: number) => void;
  setScriptPageHeightPt: (pt: number) => void;
  setScriptPdfFile: (file: File | null) => void;
  /** Back to a fresh window, for New and Open. */
  reset: () => void;
};

function clampPage(page: number, pageCount: number): number {
  const max = pageCount > 0 ? pageCount : 9999;
  return Math.max(1, Math.min(max, Math.floor(page)));
}

export const useSessionStore = create<SessionState>((set) => ({
  selection: null,
  markTab: "own",
  lineSegment: null,
  collapsedSceneIds: {},
  activeTool: "select",
  shapeKind: "rectangle",
  scenesView: "list",
  hiddenTableRows: [],
  importOpen: false,
  pdfExportOpen: false,
  pdfOptions: DEFAULT_PDF_OPTIONS,
  shotListPdfOpen: false,
  importText: null,
  snapEnabled: true,
  actionBarOffset: { x: 0, y: 0 },
  clipboard: null,
  outlineClipboard: null,
  find: { open: false, query: "", matches: [], index: 0, busy: false },
  setFind: (patch) => set((s) => ({ find: { ...s.find, ...patch } })),
  compactPanel: "properties",
  setCompactPanel: (compactPanel) => set({ compactPanel }),
  stylusSeen: false,
  setStylusSeen: (stylusSeen) => set({ stylusSeen }),
  restorePointsOpen: false,
  setRestorePointsOpen: (restorePointsOpen) => set({ restorePointsOpen }),
  settingsOpen: false,
  settingsSection: null,
  confirm: null,
  notices: [],
  viewerPage: 1,
  activePage: 1,
  pdfPageCount: 0,
  scriptPageHeightPt: 792,
  scriptPdfFile: null,

  select: (kind, id) =>
    set({
      selection: { kind, ids: [id] },
      lineSegment: null,
      // A line or note opens its own form. A shot opens the shot, with no mark tabs.
      ...(kind === "mark" ? { markTab: "own" as const } : {}),
    }),
  selectMany: (kind, ids) => set({ selection: ids.length > 0 ? { kind, ids: [...new Set(ids)] } : null, lineSegment: null }),
  selectMarks: (ids) =>
    set({ selection: ids.length > 0 ? { kind: "mark", ids: [...new Set(ids)] } : null, lineSegment: null, markTab: "own" }),
  clearSelection: () => set({ selection: null, lineSegment: null }),
  setLineSegment: (lineId, index) => set({ lineSegment: { lineId, index } }),
  clearLineSegment: () => set({ lineSegment: null }),
  setMarkTab: (markTab) => set({ markTab }),
  setSceneCollapsed: (sceneId, collapsed) =>
    set((s) => {
      if (!!s.collapsedSceneIds[sceneId] === collapsed) return s;
      const next = { ...s.collapsedSceneIds };
      if (collapsed) next[sceneId] = true;
      else delete next[sceneId];
      return { collapsedSceneIds: next };
    }),
  setCollapsedScenes: (sceneIds) =>
    set({ collapsedSceneIds: Object.fromEntries(sceneIds.map((id) => [id, true as const])) }),
  setActiveTool: (activeTool) => set({ activeTool }),
  setShapeKind: (shapeKind) => set({ shapeKind, activeTool: "shape" }),
  setScenesView: (scenesView) => set({ scenesView }),
  setImportOpen: (importOpen) => set({ importOpen }),
  setPdfExportOpen: (pdfExportOpen) => set({ pdfExportOpen }),
  setPdfOptions: (pdfOptions) => set({ pdfOptions }),
  setShotListPdfOpen: (shotListPdfOpen) => set({ shotListPdfOpen }),
  setImportText: (importText) => set({ importText }),
  hideTableRow: (id) => set((s) => ({ hiddenTableRows: [...new Set([...s.hiddenTableRows, id])] })),
  showAllTableRows: () => set({ hiddenTableRows: [] }),
  setSnapEnabled: (snapEnabled) => set({ snapEnabled }),
  setActionBarOffset: (actionBarOffset) => set({ actionBarOffset }),
  setClipboard: (clipboard) => set({ clipboard, outlineClipboard: null }),
  setOutlineClipboard: (outlineClipboard) => set({ outlineClipboard, clipboard: null }),
  setSettingsOpen: (settingsOpen, section) => set({ settingsOpen, settingsSection: settingsOpen ? (section ?? null) : null }),
  setConfirm: (confirm) => set({ confirm }),
  addNotices: (notices) =>
    set((s) => (notices.length === 0 ? s : { notices: [...s.notices, ...notices] })),
  dismissNotice: (index) => set((s) => ({ notices: s.notices.filter((_, i) => i !== index) })),
  setViewerPage: (page) =>
    set((s) => {
      const viewerPage = clampPage(page, s.pdfPageCount);
      // In single-page view the page on screen is also the active one.
      const single = usePrefsStore.getState().viewerLayoutMode === "single";
      return single ? { viewerPage, activePage: viewerPage } : { viewerPage };
    }),
  setActivePage: (page) => set((s) => ({ activePage: clampPage(page, s.pdfPageCount) })),
  setPdfPageCount: (count) =>
    set((s) => {
      const n = Math.max(0, Math.floor(count));
      return {
        pdfPageCount: n,
        viewerPage: n > 0 ? Math.min(s.viewerPage, n) : 1,
        activePage: n > 0 ? Math.min(s.activePage, n) : 1,
      };
    }),
  setScriptPageHeightPt: (pt) => set({ scriptPageHeightPt: Math.max(1, Number(pt) || 792) }),
  setScriptPdfFile: (scriptPdfFile) => set({ scriptPdfFile }),
  reset: () =>
    set({
      selection: null,
      lineSegment: null,
      collapsedSceneIds: {},
      activeTool: "select",
      snapEnabled: true,
      actionBarOffset: { x: 0, y: 0 },
      clipboard: null,
      outlineClipboard: null,
      notices: [],
      viewerPage: 1,
      activePage: 1,
      pdfPageCount: 0,
      scriptPageHeightPt: 792,
      scriptPdfFile: null,
    }),
}));
