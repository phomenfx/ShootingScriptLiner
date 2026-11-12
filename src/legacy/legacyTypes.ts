/** Shape of the old single store, kept for the screens that still use it. */
import type { MarginTrimHint } from "../lib/lineMarginContinuation";
import type { LineAnnotation, LineFieldLocks, ScriptTool, TextAnnotation } from "../types/annotations";
import type { ColorTheme } from "../types/appPreferences";
import type { LineDefaults } from "../types/lineDefaults";
import type { LineLabelFieldId } from "../types/lineLabelFields";
import type { AdditionalInfoStyle, LabelMode, Project, Scene, Shot } from "../types/project";
import type { ToolKeybinds } from "../types/toolKeybinds";
import type { ViewerLayoutMode } from "../types/viewerLayout";

export type Selection =
  | { kind: "scene"; sceneId: string }
  | { kind: "shot"; sceneId: string; shotId: string }
  | { kind: "annotation"; annotationId: string }
  | null;

export type ConfirmRequest = {
  message: string;
  onYes: () => void;
};

export type LineClipboard = { kind: "line"; lines: LineAnnotation[] };

export type LegacyState = {
  project: Project;
  selection: Selection;
  /** Session-only: scene IDs whose shot lists are folded in the outliner. */
  collapsedSceneIds: Record<string, true>;
  activeTool: ScriptTool;
  lineClipboard: LineClipboard | null;
  settingsOpen: boolean;
  confirm: ConfirmRequest | null;
  /** Primary navigation page (1-based); spread mode uses left/anchor page. */
  viewerPage: number;
  /** Page receiving keyboard paste and focus outline (1-based). */
  activePage: number;
  viewerLayoutMode: ViewerLayoutMode;
  pdfPageCount: number;
  /** PDF page height in points (72 pt = 1 in); used for margin continuation inset. */
  scriptPageHeightPt: number;
  toolKeybinds: ToolKeybinds;
  /** Chrome theme (dark/light); app preference in localStorage. Not part of the project file. */
  colorTheme: ColorTheme;
  /** Perpendicular click slop for selecting lines (px); app preference in localStorage. */
  lineHitTolerancePx: number;
  /** Max page stacks mounted in scroll view; app preference in localStorage. */
  maxMountedPdfPages: number;
  /** PDF zoom as percent (100 = scale 1.0); app preference in localStorage. */
  viewerZoomPercent: number;
  /** Active script PDF in memory (for viewer + Save ZIP when cache key mismatches). */
  scriptPdfFile: File | null;

  newProject: () => void;
  loadProject: (project: Project) => void;
  toggleSceneCollapsed: (sceneId: string) => void;
  setSceneCollapsed: (sceneId: string, collapsed: boolean) => void;
  collapseAllScenes: () => void;
  expandAllScenes: () => void;
  setProjectName: (name: string) => void;
  setScriptFileName: (scriptFileName: string) => void;
  setLabelMode: (mode: LabelMode) => void;
  setAdditionalInfoStyle: (style: AdditionalInfoStyle) => void;
  setDefaultShotColor: (color: string) => void;
  setSnapAngleDegrees: (degrees: number) => void;
  setInheritLineFromPrevious: (inherit: boolean) => void;
  setLabelOffsetXPt: (pt: number) => void;
  setLabelOffsetYPt: (pt: number) => void;
  setLabelSecondaryGapPt: (pt: number) => void;
  setScheduledDateFormat: (format: string) => void;
  setLineLabelFieldEnabled: (id: LineLabelFieldId, enabled: boolean) => void;
  moveLineLabelField: (id: LineLabelFieldId, direction: "up" | "down") => void;
  setDefaultLine: (patch: Partial<LineDefaults>) => void;
  setSettingsOpen: (open: boolean) => void;
  setConfirm: (confirm: ConfirmRequest | null) => void;
  setActiveTool: (tool: ScriptTool) => void;
  setToolKeybind: (tool: ScriptTool, key: string) => string | null;
  resetToolKeybinds: () => void;
  setColorTheme: (theme: ColorTheme) => void;
  setLineHitTolerancePx: (px: number) => void;
  setMaxMountedPdfPages: (count: number) => void;
  setViewerZoomPercent: (percent: number) => void;
  adjustViewerZoom: (deltaPercent: number) => void;
  setScriptPdfFile: (file: File | null) => void;

  selectScene: (sceneId: string) => void;
  selectShot: (sceneId: string, shotId: string) => void;
  selectAnnotation: (annotationId: string) => void;
  clearSelection: () => void;

  addScene: (slugline?: string) => void;
  updateScene: (
    sceneId: string,
    patch: Partial<Omit<Scene, "id" | "order" | "shots">>
  ) => void;
  deleteScene: (sceneId: string) => void;
  reorderScenes: (activeId: string, overId: string) => void;

  addShot: (sceneId?: string) => void;
  updateShot: (
    sceneId: string,
    shotId: string,
    patch: Partial<
      Pick<
        Shot,
        | "shotType"
        | "subject"
        | "slug"
        | "color"
        | "visible"
        | "notes"
        | "cameraSupport"
        | "lens"
        | "audioSource"
        | "indicator"
        | "location"
        | "timeOfDay"
        | "camera"
        | "fps"
        | "sync"
        | "scheduledDate"
        | "lineLabelInclude"
      >
    >
  ) => void;
  deleteShot: (sceneId: string, shotId: string) => void;
  reorderShots: (shotId: string, fromSceneId: string, toSceneId: string, overShotId: string | null) => void;
  moveShotWithinScene: (sceneId: string, activeId: string, overId: string) => void;

  addLine: (line: LineAnnotation) => void;
  updateLine: (id: string, patch: Partial<Omit<LineAnnotation, "id" | "kind">>) => void;
  updateLineLocks: (id: string, locks: Partial<LineFieldLocks>) => void;
  deleteAnnotation: (id: string) => void;
  deleteLinesForShot: (shotId: string) => void;
  copySelectedLines: () => void;
  pasteLines: (page: number) => void;
  duplicateLine: (id: string) => void;

  setViewerPage: (page: number) => void;
  setActivePage: (page: number) => void;
  setViewerLayoutMode: (mode: ViewerLayoutMode) => void;
  setPdfPageCount: (count: number) => void;
  setScriptPageHeightPt: (pt: number) => void;

  applyMarginContinuationTrim: (
    lineId: string,
    pageHeightPt?: number,
    hint?: MarginTrimHint
  ) => void;

  addText: (text: TextAnnotation) => void;
  updateText: (id: string, patch: Partial<Omit<TextAnnotation, "id" | "kind">>) => void;
  duplicateText: (id: string) => void;

  getLastSelectedSceneId: () => string | null;
  getSelectedLine: () => LineAnnotation | null;
};
