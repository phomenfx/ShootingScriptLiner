/**
 * What is going on in this window right now: selection, tool, page, open
 * dialogs, clipboard, the loaded script PDF. None of it is saved.
 */
import { create } from "zustand";
import type { Mark } from "../model/types";
import type { ScriptTool } from "../types/annotations";
import { usePrefsStore } from "./prefsStore";

/** One or more things of one kind. A single ID until multi-select exists. */
export type Selection = { kind: "scene" | "shot" | "mark"; ids: string[] } | null;

export type ConfirmRequest = {
  message: string;
  onYes: () => void;
  /** Names the action on the confirm button, such as "Delete" or "Replace project". */
  confirmLabel?: string;
  /** The action destroys something. */
  danger?: boolean;
};

type SessionState = {
  selection: Selection;
  /** Which tab a linked mark shows in Properties: its own form or its shot's. */
  markTab: "own" | "shot";
  /** Scenes folded in the Scenes list. */
  collapsedSceneIds: Record<string, true>;
  activeTool: ScriptTool;
  /** In-app clipboard for marks. */
  clipboard: Mark[] | null;
  settingsOpen: boolean;
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
  clearSelection: () => void;
  setMarkTab: (tab: "own" | "shot") => void;
  setSceneCollapsed: (sceneId: string, collapsed: boolean) => void;
  setCollapsedScenes: (sceneIds: string[]) => void;
  setActiveTool: (tool: ScriptTool) => void;
  setClipboard: (marks: Mark[] | null) => void;
  setSettingsOpen: (open: boolean) => void;
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
  collapsedSceneIds: {},
  activeTool: "select",
  clipboard: null,
  settingsOpen: false,
  confirm: null,
  notices: [],
  viewerPage: 1,
  activePage: 1,
  pdfPageCount: 0,
  scriptPageHeightPt: 792,
  scriptPdfFile: null,

  select: (kind, id) => set({ selection: { kind, ids: [id] } }),
  clearSelection: () => set({ selection: null }),
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
  setClipboard: (clipboard) => set({ clipboard }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
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
      collapsedSceneIds: {},
      activeTool: "select",
      clipboard: null,
      notices: [],
      viewerPage: 1,
      activePage: 1,
      pdfPageCount: 0,
      scriptPageHeightPt: 792,
      scriptPdfFile: null,
    }),
}));
