import { arrayMove } from "@dnd-kit/sortable";
import { create } from "zustand";
import { cloneLine, migrateLineDefaults } from "../lib/annotationUtils";
import {
  computeMarginContinuationTrim,
  type MarginTrimHint,
} from "../lib/lineMarginContinuation";
import { newId } from "../lib/ids";
import {
  assignShotOrders,
  getSortedScenes,
  getSortedShots,
  renumberAll,
} from "../lib/labelUtils";
import type { LineAnnotation, LineFieldLocks, ScriptTool, TextAnnotation } from "../types/annotations";
import type {
  AdditionalInfoStyle,
  LabelMode,
  Project,
  Scene,
  Shot,
} from "../types/project";
import { DEFAULT_PROJECT } from "../types/project";
import type { LineDefaults } from "../types/lineDefaults";
import { DEFAULT_LINE_DEFAULTS } from "../types/lineDefaults";
import { loadToolKeybinds, saveToolKeybinds, validateToolKeybindChange } from "../lib/toolKeybinds";
import { DEFAULT_TOOL_KEYBINDS, type ToolKeybinds } from "../types/toolKeybinds";
import {
  clampLineHitTolerancePx,
  loadLineHitTolerancePx,
  saveLineHitTolerancePx,
} from "../lib/appPreferences";
import { clampLabelOffsetPt, migrateLabelLayout } from "../types/labelLayout";

export type Selection =
  | { kind: "scene"; sceneId: string }
  | { kind: "shot"; sceneId: string; shotId: string }
  | { kind: "annotation"; annotationId: string }
  | null;

export type ConfirmRequest = {
  message: string;
  onYes: () => void;
};

type LineClipboard = { kind: "line"; lines: LineAnnotation[] };

type ProjectState = {
  project: Project;
  selection: Selection;
  activeTool: ScriptTool;
  lineClipboard: LineClipboard | null;
  settingsOpen: boolean;
  confirm: ConfirmRequest | null;
  /** Synced with PDF viewer (1-based). */
  viewerPage: number;
  pdfPageCount: number;
  /** PDF page height in points (72 pt = 1 in); used for margin continuation inset. */
  scriptPageHeightPt: number;
  toolKeybinds: ToolKeybinds;
  /** Perpendicular click slop for selecting lines (px); app preference in localStorage. */
  lineHitTolerancePx: number;
  /** Active script PDF in memory (for viewer + Save ZIP when cache key mismatches). */
  scriptPdfFile: File | null;

  newProject: () => void;
  loadProject: (project: Project) => void;
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
  setDefaultLine: (patch: Partial<LineDefaults>) => void;
  setSettingsOpen: (open: boolean) => void;
  setConfirm: (confirm: ConfirmRequest | null) => void;
  setActiveTool: (tool: ScriptTool) => void;
  setToolKeybind: (tool: ScriptTool, key: string) => string | null;
  resetToolKeybinds: () => void;
  setLineHitTolerancePx: (px: number) => void;
  setScriptPdfFile: (file: File | null) => void;

  selectScene: (sceneId: string) => void;
  selectShot: (sceneId: string, shotId: string) => void;
  selectAnnotation: (annotationId: string) => void;
  clearSelection: () => void;

  addScene: (slugline?: string) => void;
  updateScene: (sceneId: string, patch: Partial<Pick<Scene, "slugline" | "visible">>) => void;
  deleteScene: (sceneId: string) => void;
  reorderScenes: (activeId: string, overId: string) => void;

  addShot: (sceneId?: string) => void;
  updateShot: (
    sceneId: string,
    shotId: string,
    patch: Partial<Pick<Shot, "shotType" | "subject" | "slug" | "color" | "visible" | "notes">>
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
  setPdfPageCount: (count: number) => void;
  setScriptPageHeightPt: (pt: number) => void;

  applyMarginContinuationTrim: (
    lineId: string,
    pageHeightPt?: number,
    hint?: MarginTrimHint
  ) => void;

  addText: (text: TextAnnotation) => void;
  updateText: (id: string, patch: Partial<Omit<TextAnnotation, "id" | "kind">>) => void;

  getLastSelectedSceneId: () => string | null;
  getSelectedLine: () => LineAnnotation | null;
};

function applyScenes(project: Project, scenes: Scene[]): Project {
  return { ...project, scenes: renumberAll(scenes) };
}

function syncLockedLinesFromShots(project: Project): Project {
  let annotations = project.annotations;
  let changed = false;

  annotations = annotations.map((a) => {
    if (a.kind !== "line" || !a.shotId) return a;
    const scene = project.scenes.find((sc) => sc.shots.some((sh) => sh.id === a.shotId));
    const shot = scene?.shots.find((sh) => sh.id === a.shotId);
    if (!scene || !shot) return a;

    const line = { ...a };
    let lineChanged = false;

    if (line.locks.color) {
      const color = shot.color;
      if (line.style.color !== color) {
        line.style = { ...line.style, color };
        lineChanged = true;
      }
    }
    if (lineChanged) changed = true;
    return lineChanged ? line : a;
  });

  return changed ? { ...project, annotations } : project;
}

function createShot(project: Project, order: number): Shot {
  return {
    id: newId(),
    order,
    color: project.defaultShotColor,
    visible: true,
  };
}

function createScene(order: number, slugline = ""): Scene {
  return {
    id: newId(),
    slugline,
    order,
    visible: true,
    shots: [],
  };
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: { ...DEFAULT_PROJECT },
  selection: null,
  activeTool: "select",
  lineClipboard: null,
  settingsOpen: false,
  confirm: null,
  viewerPage: 1,
  pdfPageCount: 0,
  scriptPageHeightPt: 792,
  toolKeybinds: loadToolKeybinds(),
  lineHitTolerancePx: loadLineHitTolerancePx(),
  scriptPdfFile: null,

  newProject: () =>
    set({
      project: { ...DEFAULT_PROJECT, scenes: [] },
      selection: null,
      activeTool: "select",
      lineClipboard: null,
      viewerPage: 1,
      pdfPageCount: 0,
      scriptPageHeightPt: 792,
      scriptPdfFile: null,
    }),

  loadProject: (project) =>
    set({
      project: applyScenes(
        {
          ...DEFAULT_PROJECT,
          ...project,
          defaultLine: migrateLineDefaults(
            (project.defaultLine ?? {}) as Partial<typeof DEFAULT_LINE_DEFAULTS> &
              Record<string, unknown>,
            (project as { labelBold?: boolean }).labelBold
          ),
          inheritLineFromPrevious: project.inheritLineFromPrevious ?? false,
          snapAngleDegrees:
            project.snapAngleDegrees ??
            ((project as { snapLineAngles?: boolean }).snapLineAngles === false ? 0 : 15),
          annotations: project.annotations ?? [],
          ...migrateLabelLayout(project),
        },
        project.scenes
      ),
      selection: null,
      activeTool: "select",
      viewerPage: 1,
      pdfPageCount: 0,
      scriptPageHeightPt: 792,
      scriptPdfFile: null,
    }),

  setProjectName: (name) =>
    set((s) => ({ project: { ...s.project, name } })),

  setScriptFileName: (scriptFileName) =>
    set((s) => ({ project: { ...s.project, scriptFileName } })),

  setLabelMode: (labelMode) =>
    set((s) => ({ project: { ...s.project, labelMode } })),

  setAdditionalInfoStyle: (additionalInfoStyle) =>
    set((s) => ({ project: { ...s.project, additionalInfoStyle } })),

  setDefaultShotColor: (defaultShotColor) =>
    set((s) => ({ project: { ...s.project, defaultShotColor } })),

  setSnapAngleDegrees: (snapAngleDegrees) =>
    set((s) => ({
      project: {
        ...s.project,
        snapAngleDegrees: Math.max(0, Math.min(90, Math.round(snapAngleDegrees))),
      },
    })),

  setInheritLineFromPrevious: (inheritLineFromPrevious) =>
    set((s) => ({ project: { ...s.project, inheritLineFromPrevious } })),

  setLabelOffsetXPt: (labelOffsetXPt) =>
    set((s) => ({
      project: { ...s.project, labelOffsetXPt: clampLabelOffsetPt(labelOffsetXPt) },
    })),

  setLabelOffsetYPt: (labelOffsetYPt) =>
    set((s) => ({
      project: { ...s.project, labelOffsetYPt: clampLabelOffsetPt(labelOffsetYPt) },
    })),

  setLabelSecondaryGapPt: (labelSecondaryGapPt) =>
    set((s) => ({
      project: {
        ...s.project,
        labelSecondaryGapPt: clampLabelOffsetPt(labelSecondaryGapPt),
      },
    })),

  setDefaultLine: (patch) =>
    set((s) => ({
      project: {
        ...s.project,
        defaultLine: { ...s.project.defaultLine, ...patch },
      },
    })),

  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),

  setConfirm: (confirm) => set({ confirm }),

  setActiveTool: (activeTool) => set({ activeTool }),

  setToolKeybind: (tool, key) => {
    let error: string | null = null;
    set((s) => {
      const result = validateToolKeybindChange(s.toolKeybinds, tool, key);
      if (!result.ok) {
        error = result.reason;
        return s;
      }
      saveToolKeybinds(result.next);
      return { toolKeybinds: result.next };
    });
    return error;
  },

  resetToolKeybinds: () => {
    const next = { ...DEFAULT_TOOL_KEYBINDS };
    saveToolKeybinds(next);
    set({ toolKeybinds: next });
  },

  setLineHitTolerancePx: (px) => {
    const next = clampLineHitTolerancePx(px);
    saveLineHitTolerancePx(next);
    set({ lineHitTolerancePx: next });
  },

  setScriptPdfFile: (scriptPdfFile) => set({ scriptPdfFile }),

  setViewerPage: (page) =>
    set((s) => {
      const max = s.pdfPageCount > 0 ? s.pdfPageCount : 9999;
      const clamped = Math.max(1, Math.min(max, Math.floor(page)));
      return { viewerPage: clamped };
    }),

  setPdfPageCount: (count) =>
    set((s) => {
      const n = Math.max(0, Math.floor(count));
      const viewerPage = n > 0 ? Math.min(s.viewerPage, n) : 1;
      return { pdfPageCount: n, viewerPage };
    }),

  setScriptPageHeightPt: (pt) =>
    set({ scriptPageHeightPt: Math.max(1, Number(pt) || 792) }),

  selectScene: (sceneId) => set({ selection: { kind: "scene", sceneId } }),

  selectShot: (sceneId, shotId) =>
    set({ selection: { kind: "shot", sceneId, shotId } }),

  selectAnnotation: (annotationId) =>
    set({ selection: { kind: "annotation", annotationId } }),

  clearSelection: () => set({ selection: null }),

  getSelectedLine: () => {
    const sel = get().selection;
    if (sel?.kind !== "annotation") return null;
    const a = get().project.annotations.find((x) => x.id === sel.annotationId);
    return a?.kind === "line" ? a : null;
  },

  getLastSelectedSceneId: () => {
    const sel = get().selection;
    if (sel?.kind === "scene") return sel.sceneId;
    if (sel?.kind === "shot") return sel.sceneId;
    const sorted = getSortedScenes(get().project.scenes);
    return sorted.length > 0 ? sorted[sorted.length - 1]?.id ?? null : null;
  },

  addScene: (slugline = "") =>
    set((s) => {
      const scenes = [...s.project.scenes, createScene(s.project.scenes.length, slugline)];
      const next = applyScenes(s.project, scenes);
      const newScene = next.scenes[next.scenes.length - 1];
      return {
        project: next,
        selection: newScene ? { kind: "scene", sceneId: newScene.id } : s.selection,
      };
    }),

  updateScene: (sceneId, patch) =>
    set((s) => ({
      project: syncLockedLinesFromShots(
        applyScenes(
          s.project,
          s.project.scenes.map((sc) => (sc.id === sceneId ? { ...sc, ...patch } : sc))
        )
      ),
    })),

  deleteScene: (sceneId) =>
    set((s) => {
      const scenes = s.project.scenes.filter((sc) => sc.id !== sceneId);
      const sel =
        s.selection?.kind === "scene" && s.selection.sceneId === sceneId
          ? null
          : s.selection?.kind === "shot" && s.selection.sceneId === sceneId
            ? null
            : s.selection;
      return { project: applyScenes(s.project, scenes), selection: sel };
    }),

  reorderScenes: (activeId, overId) =>
    set((s) => {
      const sorted = getSortedScenes(s.project.scenes);
      const oldIndex = sorted.findIndex((sc) => sc.id === activeId);
      const newIndex = sorted.findIndex((sc) => sc.id === overId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return s;
      return { project: applyScenes(s.project, arrayMove(sorted, oldIndex, newIndex)) };
    }),

  addShot: (sceneId) =>
    set((s) => {
      const targetId = sceneId ?? get().getLastSelectedSceneId();
      if (!targetId) return s;

      const scenes = s.project.scenes.map((sc) => {
        if (sc.id !== targetId) return sc;
        const order = sc.shots.length;
        return { ...sc, shots: [...sc.shots, createShot(s.project, order)] };
      });
      const next = applyScenes(s.project, scenes);
      const scene = next.scenes.find((sc) => sc.id === targetId);
      const shot = scene?.shots[scene.shots.length - 1];
      return {
        project: next,
        selection: shot ? { kind: "shot", sceneId: targetId, shotId: shot.id } : s.selection,
      };
    }),

  updateShot: (sceneId, shotId, patch) =>
    set((s) => ({
      project: syncLockedLinesFromShots(
        applyScenes(
          s.project,
          s.project.scenes.map((sc) =>
            sc.id !== sceneId
              ? sc
              : {
                  ...sc,
                  shots: sc.shots.map((sh) => (sh.id === shotId ? { ...sh, ...patch } : sh)),
                }
          )
        )
      ),
    })),

  deleteShot: (sceneId, shotId) =>
    set((s) => {
      const scenes = s.project.scenes.map((sc) =>
        sc.id !== sceneId
          ? sc
          : { ...sc, shots: sc.shots.filter((sh) => sh.id !== shotId) }
      );
      const sel =
        s.selection?.kind === "shot" && s.selection.shotId === shotId ? null : s.selection;
      return { project: applyScenes(s.project, scenes), selection: sel };
    }),

  moveShotWithinScene: (sceneId, activeId, overId) =>
    set((s) => {
      const scenes = s.project.scenes.map((sc) => {
        if (sc.id !== sceneId) return sc;
        const sorted = getSortedShots(sc);
        const oldIndex = sorted.findIndex((sh) => sh.id === activeId);
        const newIndex = sorted.findIndex((sh) => sh.id === overId);
        if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return sc;
        return {
          ...sc,
          shots: assignShotOrders(arrayMove(sorted, oldIndex, newIndex)),
        };
      });
      return { project: applyScenes(s.project, scenes) };
    }),

  reorderShots: (shotId, fromSceneId, toSceneId, overShotId) =>
    set((s) => {
      let moving: Shot | undefined;
      let scenes = s.project.scenes.map((sc) => {
        if (sc.id !== fromSceneId) return sc;
        const found = sc.shots.find((sh) => sh.id === shotId);
        moving = found;
        return { ...sc, shots: sc.shots.filter((sh) => sh.id !== shotId) };
      });
      if (!moving) return s;

      scenes = scenes.map((sc) => {
        if (sc.id !== toSceneId) return sc;
        const sorted = getSortedShots(sc);
        let insertAt = sorted.length;
        if (overShotId) {
          const idx = sorted.findIndex((sh) => sh.id === overShotId);
          if (idx >= 0) insertAt = idx;
        }
        const next = [...sorted];
        next.splice(insertAt, 0, moving!);
        return { ...sc, shots: assignShotOrders(next) };
      });
      return { project: applyScenes(s.project, scenes) };
    }),

  addLine: (line) =>
    set((s) => ({
      project: {
        ...s.project,
        annotations: [...s.project.annotations, line],
      },
      selection: { kind: "annotation", annotationId: line.id },
    })),

  applyMarginContinuationTrim: (lineId, pageHeightPt, hint = "drawEnd") =>
    set((s) => {
      const pt = pageHeightPt ?? s.scriptPageHeightPt;
      const ann = s.project.annotations.find((a) => a.id === lineId && a.kind === "line");
      if (!ann || ann.kind !== "line") return s;
      const [a, b] = ann.points;
      const { points, marginContinuation } = computeMarginContinuationTrim(a, b, pt, hint);
      return {
        project: {
          ...s.project,
          annotations: s.project.annotations.map((x) =>
            x.id === lineId && x.kind === "line"
              ? { ...x, points, marginContinuation }
              : x
          ),
        },
      };
    }),

  addText: (text) =>
    set((s) => ({
      project: {
        ...s.project,
        annotations: [...s.project.annotations, text],
      },
      selection: { kind: "annotation", annotationId: text.id },
    })),

  updateText: (id, patch) =>
    set((s) => ({
      project: {
        ...s.project,
        annotations: s.project.annotations.map((a) =>
          a.id === id && a.kind === "text" ? { ...a, ...patch } : a
        ),
      },
    })),

  updateLine: (id, patch) =>
    set((s) => ({
      project: {
        ...s.project,
        annotations: s.project.annotations.map((a) =>
          a.id === id && a.kind === "line" ? { ...a, ...patch } : a
        ),
      },
    })),

  updateLineLocks: (id, locks) =>
    set((s) => ({
      project: {
        ...s.project,
        annotations: s.project.annotations.map((a) => {
          if (a.id !== id || a.kind !== "line") return a;
          return { ...a, locks: { ...a.locks, ...locks } };
        }),
      },
    })),

  deleteAnnotation: (id) =>
    set((s) => {
      const annotations = s.project.annotations.filter((a) => a.id !== id);
      return {
        project: { ...s.project, annotations },
        selection:
          s.selection?.kind === "annotation" && s.selection.annotationId === id
            ? null
            : s.selection,
      };
    }),

  deleteLinesForShot: (shotId) =>
    set((s) => ({
      project: {
        ...s.project,
        annotations: s.project.annotations.filter(
          (a) => !(a.kind === "line" && a.shotId === shotId)
        ),
      },
    })),

  copySelectedLines: () => {
    const line = get().getSelectedLine();
    if (!line) return;
    set({ lineClipboard: { kind: "line", lines: [line] } });
  },

  pasteLines: (page) => {
    const clip = get().lineClipboard;
    if (!clip?.lines.length) return;
    const newLines = clip.lines.map((l) => cloneLine(l, page));
    set((s) => ({
      project: {
        ...s.project,
        annotations: [...s.project.annotations, ...newLines],
      },
      selection: {
        kind: "annotation",
        annotationId: newLines[newLines.length - 1]!.id,
      },
    }));
  },

  duplicateLine: (id) => {
    const line = get().project.annotations.find((a) => a.id === id && a.kind === "line");
    if (!line || line.kind !== "line") return;
    const dup = cloneLine(line);
    get().addLine(dup);
    get().applyMarginContinuationTrim(dup.id, get().scriptPageHeightPt, "center");
  },
}));
