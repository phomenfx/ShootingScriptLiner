/**
 * Temporary bridge for the rework: the old single store, rebuilt on top of
 * the three new stores. Screens that have not been rebuilt yet keep calling
 * it exactly as before, while the data underneath is version 2.
 * Deleted together with the last old screen.
 */
import { useSyncExternalStore } from "react";
import * as commands from "../commands";
import { migrateV1 } from "../io/migrateV1";
import {
  addLine,
  addText,
  applyMarginContinuationTrim,
  currentLineLabel,
  noteShotTypeLock,
  replaceLine,
  selectMark,
  shotTypeUnlocks,
  subscribeShotTypeUnlock,
  updateText,
} from "../drawing/marks";
import { splitSlugline } from "../lib/slugline";
import { createScene, createShot } from "../model/defaults";
import * as edits from "../model/edits";
import type * as V2 from "../model/types";
import {
  applyWithoutUndo,
  breakUndoGroup,
  replaceProject,
  useProjectStore,
} from "../stores/projectStore";
import { usePrefsStore } from "../stores/prefsStore";
import { useSessionStore } from "../stores/sessionStore";
import { V1_CAPTION_FIELD_IDS } from "../io/migrateV1";
import {
  applyLegacyDefaultLinePatch,
  applyLegacyScenePatch,
  applyLegacyShotPatch,
  legacyLine,
  toLegacyProject,
} from "./legacyView";
import type { LegacyState, LineClipboard, Selection } from "./legacyTypes";

export type { ConfirmRequest, Selection } from "./legacyTypes";

const projectState = () => useProjectStore.getState();
const v2 = () => projectState().project;
const session = () => useSessionStore.getState();
const prefs = () => usePrefsStore.getState();

/** One undo step for a single deliberate action (add, delete, reorder). */
function applyStep(edit: edits.Edit): void {
  breakUndoGroup();
  projectState().apply(edit);
}

const apply = (edit: edits.Edit) => projectState().apply(edit);

const settings = (recipe: (s: V2.ProjectSettings) => V2.ProjectSettings) =>
  apply(edits.updateSettings(recipe));

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const captionOffset = (value: number) => (Number.isFinite(Number(value)) ? clamp(Number(value), 0, 48) : 3);

function selectedSceneId(): string | null {
  const selection = session().selection;
  const id = selection?.ids[0];
  const project = v2();
  if (selection?.kind === "scene") return id ?? null;
  if (selection?.kind === "shot") return edits.findShot(project, id)?.scene.id ?? null;
  if (selection?.kind === "mark") {
    const mark = edits.findMark(project, id);
    const scene = mark ? edits.findShot(project, edits.markShotId(mark))?.scene : undefined;
    if (scene) return scene.id;
  }
  return project.scenes[project.scenes.length - 1]?.id ?? null;
}

const actions: Omit<
  LegacyState,
  | "project"
  | "selection"
  | "collapsedSceneIds"
  | "activeTool"
  | "lineClipboard"
  | "settingsOpen"
  | "confirm"
  | "viewerPage"
  | "activePage"
  | "viewerLayoutMode"
  | "pdfPageCount"
  | "scriptPageHeightPt"
  | "toolKeybinds"
  | "colorTheme"
  | "lineHitTolerancePx"
  | "maxMountedPdfPages"
  | "viewerZoomPercent"
  | "scriptPdfFile"
> = {
  newProject: () => commands.newProject(),
  loadProject: (project) => {
    const { project: loaded } = migrateV1({ ...project, version: 1 }, v2().script);
    session().reset();
    replaceProject(loaded);
    commands.syncSnapFromProject();
  },

  toggleSceneCollapsed: (sceneId) =>
    session().setSceneCollapsed(sceneId, !session().collapsedSceneIds[sceneId]),
  setSceneCollapsed: (sceneId, collapsed) => session().setSceneCollapsed(sceneId, collapsed),
  collapseAllScenes: () => session().setCollapsedScenes(v2().scenes.map((scene) => scene.id)),
  expandAllScenes: () => session().setCollapsedScenes([]),

  setProjectName: (name) => apply(edits.setName(name)),
  setScriptFileName: (fileName) =>
    applyWithoutUndo((p) =>
      edits.setScript(
        p.script?.fileName === fileName
          ? p.script
          : { fileName, pageCount: 0, pages: [], fingerprint: "" }
      )(p)
    ),
  setLabelMode: (shotIdStyle) => settings((s) => ({ ...s, general: { ...s.general, shotIdStyle } })),
  setAdditionalInfoStyle: (additionalInfoStyle) =>
    settings((s) => ({ ...s, general: { ...s.general, additionalInfoStyle } })),
  setDefaultShotColor: (newShotColor) =>
    settings((s) => ({ ...s, general: { ...s.general, newShotColor } })),
  setSnapAngleDegrees: (degrees) =>
    settings((s) => ({
      ...s,
      drawing: { ...s.drawing, angleSnapDegrees: clamp(Math.round(degrees), 0, 90) },
    })),
  setInheritLineFromPrevious: (newLineCopiesPrevious) =>
    settings((s) => ({ ...s, drawing: { ...s.drawing, newLineCopiesPrevious } })),
  setLabelOffsetXPt: (pt) =>
    settings((s) => ({ ...s, captions: { ...s.captions, offsetAcrossPt: captionOffset(pt) } })),
  setLabelOffsetYPt: (pt) =>
    settings((s) => ({ ...s, captions: { ...s.captions, offsetAbovePt: captionOffset(pt) } })),
  setLabelSecondaryGapPt: (pt) =>
    settings((s) => ({ ...s, captions: { ...s.captions, contGapPt: captionOffset(pt) } })),
  setScheduledDateFormat: (dateFormat) =>
    settings((s) => ({ ...s, captions: { ...s.captions, dateFormat } })),
  setLineLabelFieldEnabled: (id, print) =>
    settings((s) => ({
      ...s,
      captions: {
        ...s.captions,
        fields: s.captions.fields.map((f) => (f.id === V1_CAPTION_FIELD_IDS[id] ? { ...f, print } : f)),
      },
    })),
  moveLineLabelField: (id, direction) =>
    settings((s) => {
      // Swap with the neighbor the old settings list shows, skipping fields it does not know.
      const known = new Set(Object.values(V1_CAPTION_FIELD_IDS));
      const fields = [...s.captions.fields];
      const from = fields.findIndex((f) => f.id === V1_CAPTION_FIELD_IDS[id]);
      const step = direction === "up" ? -1 : 1;
      let to = from + step;
      while (to >= 0 && to < fields.length && !known.has(fields[to]!.id)) to += step;
      if (from < 0 || to < 0 || to >= fields.length) return s;
      [fields[from], fields[to]] = [fields[to]!, fields[from]!];
      return { ...s, captions: { ...s.captions, fields } };
    }),
  setDefaultLine: (patch) => settings((s) => applyLegacyDefaultLinePatch(s, patch)),

  setSettingsOpen: (open) => session().setSettingsOpen(open),
  setConfirm: (confirm) => {
    // With "Delete asks first" off, deletes go straight through. Undo brings them back.
    if (confirm?.confirmLabel === "Delete" && !prefs().confirmDeletes) confirm.onYes(false);
    else session().setConfirm(confirm);
  },
  setActiveTool: (tool) => session().setActiveTool(tool),
  setToolKeybind: (tool, key) => prefs().setToolKeybind(tool, key),
  resetToolKeybinds: () => prefs().resetToolKeybinds(),
  setColorTheme: (theme) => prefs().setColorTheme(theme),
  setLineHitTolerancePx: (px) => prefs().setLineHitTolerancePx(px),
  setMaxMountedPdfPages: (count) => prefs().setMaxMountedPdfPages(count),
  setViewerZoomPercent: (percent) => prefs().setViewerZoomPercent(percent),
  adjustViewerZoom: (delta) => prefs().setViewerZoomPercent(prefs().viewerZoomPercent + delta),
  setScriptPdfFile: (file) => {
    session().setScriptPdfFile(file);
    // A PDF that arrives before its page sizes are known still has to be measured.
    if (file && !v2().script?.pages.length) void commands.adoptScript(file);
  },

  selectScene: (sceneId) => session().select("scene", sceneId),
  selectShot: (sceneId, shotId) => {
    session().setSceneCollapsed(sceneId, false);
    session().select("shot", shotId);
  },
  selectAnnotation: (id) => selectMark(id),
  clearSelection: () => session().clearSelection(),

  addScene: (slugline = "") => {
    const parts = splitSlugline(slugline);
    const scene = createScene({
      indicator: parts.indicator,
      location: parts.location,
      time: parts.timeOfDay,
    });
    applyStep(edits.addScene(scene));
    session().select("scene", scene.id);
  },
  updateScene: (sceneId, patch) =>
    apply(edits.updateScene(sceneId, (scene) => applyLegacyScenePatch(scene, patch))),
  deleteScene: (sceneId) => {
    const scene = v2().scenes.find((sc) => sc.id === sceneId);
    const selection = session().selection;
    const id = selection?.ids[0];
    if (
      (selection?.kind === "scene" && id === sceneId) ||
      (selection?.kind === "shot" && scene?.shots.some((shot) => shot.id === id))
    ) {
      session().clearSelection();
    }
    session().setSceneCollapsed(sceneId, false);
    applyStep(edits.deleteScene(sceneId));
  },
  reorderScenes: (activeId, overId) => {
    const to = v2().scenes.findIndex((scene) => scene.id === overId);
    if (to >= 0) applyStep(edits.moveScene(activeId, to));
  },

  addShot: (sceneId) => {
    const targetId = sceneId ?? selectedSceneId();
    if (!targetId || !v2().scenes.some((scene) => scene.id === targetId)) return;
    const shot = createShot(v2());
    applyStep(edits.addShot(targetId, shot));
    session().setSceneCollapsed(targetId, false);
    session().select("shot", shot.id);
  },
  updateShot: (_sceneId, shotId, patch) =>
    apply(edits.updateShot(shotId, (shot, scene) => applyLegacyShotPatch(shot, scene, patch))),
  deleteShot: (_sceneId, shotId) => {
    const selection = session().selection;
    if (selection?.kind === "shot" && selection.ids[0] === shotId) session().clearSelection();
    applyStep(edits.deleteShot(shotId));
  },
  reorderShots: (shotId, _fromSceneId, toSceneId, overShotId) => {
    const target = v2().scenes.find((scene) => scene.id === toSceneId);
    if (!target) return;
    const others = target.shots.filter((shot) => shot.id !== shotId);
    const over = overShotId ? others.findIndex((shot) => shot.id === overShotId) : -1;
    applyStep(edits.moveShot(shotId, toSceneId, over >= 0 ? over : others.length));
  },
  moveShotWithinScene: (sceneId, activeId, overId) => {
    const scene = v2().scenes.find((sc) => sc.id === sceneId);
    const to = scene?.shots.findIndex((shot) => shot.id === overId) ?? -1;
    if (to >= 0) applyStep(edits.moveShot(activeId, sceneId, to));
  },

  addLine,
  updateLine: (id, patch) => replaceLine(id, patch),
  updateLineLocks: (id, locks) => {
    if ("shotType" in locks && typeof locks.shotType === "boolean") noteShotTypeLock(id, locks.shotType);
    const mark = edits.findMark(v2(), id);
    if (mark?.kind !== "line" || !("label" in locks || "color" in locks)) return;
    const shown = legacyLine(mark, v2(), false);
    const patch: Partial<typeof shown> = { locks: { ...shown.locks, ...locks } };
    // Unlocking a caption starts from what the caption says now.
    if (locks.label === false && shown.locks.label) patch.label = currentLineLabel(id);
    replaceLine(id, patch);
  },
  deleteAnnotation: (id) => {
    const selection = session().selection;
    if (selection?.kind === "mark" && selection.ids[0] === id) session().clearSelection();
    applyStep(edits.deleteMarks([id]));
  },
  deleteLinesForShot: (shotId) => applyStep(edits.deleteLinesForShot(shotId)),
  copySelectedLines: () => {
    if (actions.getSelectedLine()) commands.copy();
  },
  pasteLines: (page) => commands.paste(page),
  duplicateLine: (id) => {
    const found = edits.findMark(v2(), id);
    const base = found?.kind === "line" ? found : null;
    if (!base) return;
    const clone = edits.cloneMark(base, { nudgePt: edits.CLONE_NUDGE_PT });
    applyStep(edits.addMarks([clone]));
    session().select("mark", clone.id);
    actions.applyMarginContinuationTrim(clone.id, session().scriptPageHeightPt, "center");
  },

  setViewerPage: (page) => session().setViewerPage(page),
  setActivePage: (page) => session().setActivePage(page),
  setViewerLayoutMode: (mode) => {
    prefs().setViewerLayoutMode(mode);
    if (mode === "single") session().setActivePage(session().viewerPage);
  },
  setPdfPageCount: (count) => session().setPdfPageCount(count),
  setScriptPageHeightPt: (pt) => session().setScriptPageHeightPt(pt),

  applyMarginContinuationTrim: (lineId, pageHeightPt, hint = "drawEnd") =>
    applyMarginContinuationTrim(lineId, pageHeightPt ?? session().scriptPageHeightPt, hint),

  addText,
  updateText,
  duplicateText: (id) => {
    const base = edits.findMark(v2(), id);
    if (base?.kind !== "text") return;
    const clone = edits.cloneMark(base, { nudgePt: edits.CLONE_NUDGE_PT });
    applyStep(edits.addMarks([clone]));
    session().select("mark", clone.id);
  },

  getLastSelectedSceneId: () => selectedSceneId(),
  getSelectedLine: () => {
    const selection = getState().selection;
    if (selection?.kind !== "annotation") return null;
    const found = getState().project.annotations.find((a) => a.id === selection.annotationId);
    return found?.kind === "line" ? found : null;
  },
};

/* ---------- the combined view ---------- */

let selectionCache: { from: unknown; sceneId: string | undefined; out: Selection } | null = null;

function legacySelection(): Selection {
  const selection = session().selection;
  const id = selection?.ids[0];
  if (!selection || !id) return null;
  const sceneId =
    selection.kind === "shot" ? edits.findShot(v2(), id)?.scene.id : undefined;
  if (selectionCache?.from === selection && selectionCache.sceneId === sceneId) {
    return selectionCache.out;
  }
  let out: Selection = null;
  if (selection.kind === "scene") out = { kind: "scene", sceneId: id };
  else if (selection.kind === "mark") out = { kind: "annotation", annotationId: id };
  else if (sceneId) out = { kind: "shot", sceneId, shotId: id };
  selectionCache = { from: selection, sceneId, out };
  return out;
}

let clipboardCache: { from: unknown; project: V2.Project; out: LineClipboard | null } | null = null;

function legacyClipboard(): LineClipboard | null {
  const clipboard = session().clipboard;
  if (clipboardCache?.from === clipboard) return clipboardCache.out;
  const lines = (clipboard ?? []).flatMap((mark) =>
    mark.kind === "line" ? [legacyLine(mark, v2())] : []
  );
  const out: LineClipboard | null = lines.length > 0 ? { kind: "line", lines } : null;
  clipboardCache = { from: clipboard, project: v2(), out };
  return out;
}

let snapshot: { key: unknown[]; state: LegacyState } | null = null;

function getState(): LegacyState {
  const s = session();
  const p = prefs();
  const key = [v2(), s, p, shotTypeUnlocks()];
  if (snapshot && snapshot.key.every((part, i) => part === key[i])) return snapshot.state;
  const state: LegacyState = {
    ...actions,
    project: toLegacyProject(v2(), shotTypeUnlocks()),
    selection: legacySelection(),
    collapsedSceneIds: s.collapsedSceneIds,
    activeTool: s.activeTool,
    lineClipboard: legacyClipboard(),
    settingsOpen: s.settingsOpen,
    confirm: s.confirm,
    viewerPage: s.viewerPage,
    activePage: s.activePage,
    viewerLayoutMode: p.viewerLayoutMode,
    pdfPageCount: s.pdfPageCount,
    scriptPageHeightPt: s.scriptPageHeightPt,
    toolKeybinds: p.toolKeybinds,
    colorTheme: p.colorTheme,
    lineHitTolerancePx: p.lineHitTolerancePx,
    maxMountedPdfPages: p.maxMountedPdfPages,
    viewerZoomPercent: p.viewerZoomPercent,
    scriptPdfFile: s.scriptPdfFile,
  };
  snapshot = { key, state };
  return state;
}

function subscribe(listener: () => void): () => void {
  const stops = [
    useProjectStore.subscribe(listener),
    useSessionStore.subscribe(listener),
    usePrefsStore.subscribe(listener),
  ];
  const stopUnlock = subscribeShotTypeUnlock(listener);
  return () => {
    stops.forEach((stop) => stop());
    stopUnlock();
  };
}

function useLegacyStoreHook<T>(selector: (state: LegacyState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(getState()));
}

/** The old `useProjectStore`, under a name that says what it is. */
export const useLegacyStore = Object.assign(useLegacyStoreHook, { getState });
