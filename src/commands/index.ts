/**
 * Everything the user can do that is more than a field edit. Menus, buttons,
 * shortcuts and the action bar all call these, so each action has one
 * implementation.
 */
import { rejoinLine, splitLine } from "../drawing/marks";
import { placeUnplacedV1Marks } from "../io/migrateV1";
import { buildProjectZip, downloadBlob, readProjectFile, scriptNameInJson } from "../io/projectFiles";
import { readProjectJson } from "../io/readProject";
import { buildShotListRows, rowsToCsv } from "../io/shotListCsv";
import { compareScript, describeScript, scriptMismatchMessage } from "../io/scriptIdentity";
import { projectFileStem } from "../io/writeProject";
import { toLegacyProject } from "../legacy/legacyView";
import { loadPdfFromCache, savePdfToCache } from "../lib/pdfCache";
import { createProject, createScene, createShot } from "../model/defaults";
import { clearAutosave, readAutosave, startAutosave, type Autosave } from "../io/autosave";
import { addScene, addShot, updateScene, updateShot } from "../model/edits";
import { CLONE_NUDGE_PT, addMarks, cloneMark, deleteMarks, deleteScene, deleteShot, findShot, setScript, unlinkMark, updateMark, updateSettings } from "../model/edits";
import { insertOutline, outlineClipOf, type OutlineAnchor, type OutlineClip } from "../model/outlineClipboard";
import { findHeadings, planScenes } from "../model/sceneDetect";
import type { Mark, Project, ScriptInfo } from "../model/types";
import {
  applyWithoutUndo,
  breakUndoGroup,
  markProjectSaved,
  redoProject,
  replaceProject,
  undoProject,
  useProjectStore,
  markProjectUnsaved,
} from "../stores/projectStore";
import { usePrefsStore } from "../stores/prefsStore";
import { useSessionStore } from "../stores/sessionStore";
import type { ViewerLayoutMode } from "../types/viewerLayout";

const project = () => useProjectStore.getState().project;
const session = () => useSessionStore.getState();

function notify(...messages: string[]): void {
  session().addNotices(messages);
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Key of a project's script in the browser's PDF cache. */
function cacheKey(name: string, scriptFileName: string | undefined): string {
  return `${name.replace(/[^\w.-]+/g, "_") || "project"}__${scriptFileName ?? "none"}`;
}

async function cacheScript(p: Project, file: File): Promise<void> {
  try {
    await savePdfToCache(cacheKey(p.name, p.script?.fileName), file);
  } catch {
    // The cache is a convenience; the project still works without it.
  }
}

/**
 * Asks before doing something that cannot be taken back. The button names the
 * action. Resolves false when declined or dismissed.
 */
export function confirm(message: string, confirmLabel: string, danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    const unsubscribe = useSessionStore.subscribe((s) => {
      if (s.confirm === null) {
        unsubscribe();
        resolve(false);
      }
    });
    session().setConfirm({
      message,
      confirmLabel,
      danger,
      onYes: () => {
        unsubscribe();
        resolve(true);
      },
    });
  });
}

/** Opens the system file picker. Resolves null when nothing was chosen. */
function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

function hasUnsavedWork(): boolean {
  const state = useProjectStore.getState();
  return state.project !== state.savedProject;
}

/* ---------- autosave ---------- */

let autosaveStarted = false;

/**
 * Starts autosave and, once per page load, offers to bring back unsaved work
 * from last time. Keeps the script PDF cached under the project's current name
 * so a restore finds it.
 */
export function startAutosaveAndOfferRestore(): void {
  if (autosaveStarted) return;
  autosaveStarted = true;
  const saved = readAutosave();
  startAutosave();
  useProjectStore.subscribe((state, previous) => {
    const file = session().scriptPdfFile;
    if (!file) return;
    const renamed = state.project.name !== previous.project.name || state.project.script?.fileName !== previous.project.script?.fileName;
    if (renamed) void cacheScript(state.project, file);
  });
  if (saved) void offerRestore(saved);
}

async function offerRestore(saved: Autosave): Promise<void> {
  const when = new Date(saved.savedAt).toLocaleString();
  const what = saved.name ? `"${saved.name}"` : "a project";
  const ok = await confirm(
    `You have unsaved work on ${what} from ${when}. Restore it? Choosing Cancel discards it.`,
    "Restore"
  );
  if (!ok) {
    clearAutosave();
    return;
  }
  await openProject(new File([saved.json], `${saved.name || "autosave"}.json`, { type: "application/json" }));
  // Restored work is still not saved to a file.
  markProjectUnsaved();
}

/* ---------- project files ---------- */

/** The Snap button starts on when the project's angle snap is on. */
export function syncSnapFromProject(): void {
  session().setSnapEnabled(project().settings.drawing.angleSnapDegrees > 0);
}

export function newProject(): void {
  session().reset();
  replaceProject(createProject());
  syncSnapFromProject();
}

/** New project from the menu: asks first when there is unsaved work. */
export async function requestNewProject(): Promise<void> {
  if (hasUnsavedWork() && !(await confirm("Start a new project? Unsaved changes will be lost.", "New project", true))) {
    return;
  }
  newProject();
}

/** Open from the menu: picks a file, and asks first when there is unsaved work. */
export async function requestOpenProject(): Promise<void> {
  const file = await pickFile(".zip,.json,application/zip,application/json");
  if (!file) return;
  if (
    hasUnsavedWork() &&
    !(await confirm(`Open "${file.name}"? Unsaved changes to this project will be lost.`, "Replace project", true))
  ) {
    return;
  }
  await openProject(file);
}

export async function requestImportPdf(): Promise<void> {
  const file = await pickFile(".pdf,application/pdf");
  if (file) await importPdf(file);
}

/**
 * Reads scene headings from the script's text (INT., EXT., INT./EXT., I/E,
 * EST.) and puts them into the scene list, after a summary and a confirm.
 * Numbered headings keep their number, with blank scenes for any gap.
 */
export async function detectScenes(): Promise<void> {
  const file = await scriptFileForExport();
  if (!file) {
    notify("Import the script PDF first, then detect scenes.");
    return;
  }
  try {
    const { readScriptLines } = await import("../io/scriptText");
    const pages = await readScriptLines(file);
    if (pages.every((lines) => lines.length === 0)) {
      notify("This PDF has no text to read (it may be a scanned script), so no scene headings could be found.");
      return;
    }
    const found = findHeadings(pages);
    if (found.length === 0) {
      notify("No scene headings found. A heading starts with INT., EXT., INT./EXT., I/E or EST.");
      return;
    }
    const plan = planScenes(project(), found);
    const used = plan.used;
    if (plan.filled === 0 && plan.blanks === 0) {
      notify(`Found ${used.length} scene headings, but those scenes already have headings. Nothing changed.`);
      return;
    }
    const sample = used
      .slice(0, 3)
      .map((h) => `${h.number !== undefined ? `${h.number}. ` : ""}${h.heading.indicator} ${h.heading.location}${h.heading.time ? ` - ${h.heading.time}` : ""}`)
      .join("; ");
    const parts = [`Found ${used.length} scene ${used.length === 1 ? "heading" : "headings"} (${sample}${used.length > 3 ? "; …" : ""}).`];
    parts.push(`This fills ${plan.filled} ${plan.filled === 1 ? "scene" : "scenes"}`);
    if (plan.blanks) parts[1] += ` and adds ${plan.blanks} blank ${plan.blanks === 1 ? "scene" : "scenes"} so the numbers line up`;
    parts[1] += ".";
    if (plan.kept) parts.push(`${plan.kept} ${plan.kept === 1 ? "scene keeps its" : "scenes keep their"} own heading.`);
    if (!(await confirm(parts.join(" "), "Add scenes"))) return;
    breakUndoGroup();
    useProjectStore.getState().apply((current) => planScenes(current, found).project);
    breakUndoGroup();
  } catch (error) {
    notify(errorText(error, "Could not read the script's text."));
  }
}

export async function exportBoth(): Promise<void> {
  await exportLinedPdf();
  await exportShotListCsv();
}

export async function openProject(file: File): Promise<void> {
  try {
    const contents = await readProjectFile(file);
    let pdfFile = contents.pdfFile;
    if (!pdfFile) {
      // A bare JSON file: the script may still be in this browser from last time.
      const name = (JSON.parse(contents.json) as { name?: string }).name ?? "";
      pdfFile = await loadPdfFromCache(cacheKey(name, scriptNameInJson(contents.json))).catch(() => null);
    }
    const script = pdfFile ? await describeScript(await pdfFile.arrayBuffer(), pdfFile.name) : undefined;
    const { project: loaded, notices } = readProjectJson(contents.json, script);

    let opened = loaded;
    if (script) {
      const warning = scriptMismatchMessage(compareScript(loaded.script, script), loaded.script, script);
      if (warning && !(await confirm(warning, "Open anyway"))) return;
      opened = setScript({ ...script, fileName: loaded.script?.fileName ?? script.fileName })(loaded);
      const placed = placeUnplacedV1Marks(opened);
      opened = placed.project;
      notices.push(...placed.notices);
    } else if (loaded.script) {
      notices.push(
        `The script "${loaded.script.fileName}" is not in this file or this browser. Import it to see the pages.`
      );
    }

    session().reset();
    replaceProject(opened);
    syncSnapFromProject();
    session().setScriptPdfFile(pdfFile);
    notify(...notices);
    if (pdfFile) await cacheScript(opened, pdfFile);
  } catch (error) {
    notify(errorText(error, "Could not open this file. Use a project .zip or .json file."));
  }
}

async function scriptFileForExport(): Promise<File | null> {
  const p = project();
  return (
    session().scriptPdfFile ??
    (await loadPdfFromCache(cacheKey(p.name, p.script?.fileName)).catch(() => null))
  );
}

export async function saveZip(): Promise<void> {
  try {
    const p = project();
    const pdfFile = await scriptFileForExport();
    if (!pdfFile && p.script) {
      notify(`The script "${p.script.fileName}" is not loaded, so this save has no PDF in it. Import the script and save again.`);
    }
    downloadBlob(await buildProjectZip(p, pdfFile), `${projectFileStem(p)}.zip`);
    if (useProjectStore.getState().project === p) markProjectSaved();
    if (pdfFile) await cacheScript(p, pdfFile);
  } catch (error) {
    notify(errorText(error, "Could not save the project."));
  }
}

/** Sets the script PDF the project is lined on. */
export async function importPdf(file: File): Promise<void> {
  try {
    const script = await describeScript(await file.arrayBuffer(), file.name);
    const current = project();
    if (current.marks.length > 0) {
      const warning = scriptMismatchMessage(compareScript(current.script, script), current.script, script);
      if (warning && !(await confirm(warning, "Use this script"))) return;
    }
    await adoptScript(file, script);
  } catch (error) {
    notify(errorText(error, "Could not read this PDF."));
  }
}

/**
 * Records a script's details on the project and shows it. Also places any
 * version 1 marks that were waiting for page sizes.
 */
export async function adoptScript(file: File, known?: ScriptInfo): Promise<void> {
  const script = known ?? (await describeScript(await file.arrayBuffer(), file.name));
  let notices: string[] = [];
  applyWithoutUndo((p) => {
    const placed = placeUnplacedV1Marks(setScript(script)(p));
    notices = placed.notices;
    return placed.project;
  });
  session().setScriptPdfFile(file);
  notify(...notices);
  await cacheScript(project(), file);
}

export async function exportLinedPdf(): Promise<void> {
  try {
    const pdfFile = await scriptFileForExport();
    if (!pdfFile) {
      notify("Import the script PDF first, then export again.");
      return;
    }
    const { buildLinedPdfBytes } = await import("../lib/pdfExport");
    const bytes = await buildLinedPdfBytes(
      toLegacyProject(project()),
      await pdfFile.arrayBuffer(),
      project().marks.filter((mark) => mark.kind === "line"),
      project(),
      session().pdfOptions
    );
    downloadBlob(new Blob([bytes], { type: "application/pdf" }), `${projectFileStem(project())}-lined.pdf`);
  } catch (error) {
    notify(
      error instanceof Error && (error.message.includes("font") || error.message.startsWith("Nothing to export"))
        ? error.message
        : "Could not export the PDF. Check that the font files are in public/fonts/."
    );
  }
}

/** Opens the Export lined PDF dialog: choose shots, marks and pages, then export. */
export function requestExportLinedPdf(): void {
  if (!project().script) {
    notify("Import the script PDF first, then export again.");
    return;
  }
  session().setPdfExportOpen(true);
}

export async function exportShotListCsv(): Promise<void> {
  const csv = rowsToCsv(buildShotListRows(project()));
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${projectFileStem(project())}-shot-list.csv`);
}

/* ---------- selection and clipboard ---------- */

function selectedMarks(): Mark[] {
  const selection = session().selection;
  if (selection?.kind !== "mark") return [];
  return project().marks.filter((mark) => selection.ids.includes(mark.id));
}

function addAndSelect(marks: Mark[]): void {
  if (marks.length === 0) return;
  breakUndoGroup();
  useProjectStore.getState().apply(addMarks(marks));
  session().select("mark", marks[marks.length - 1]!.id);
}

/** Opens the page of a shot's first line and keeps the shot selected. Returns false when it has none. */
export function jumpToShot(shotId: string): boolean {
  const marks = project().marks.filter((m) => m.kind !== "image" && m.shotId === shotId);
  const mark = marks.find((m) => m.kind === "line") ?? marks[0];
  if (!mark) return false;
  session().setViewerPage(mark.page);
  session().setActivePage(mark.page);
  session().select("shot", shotId);
  return true;
}

export function deleteSelection(): void {
  const outline = selectedOutline();
  if (outline) {
    void removeOutline(outline, "Delete");
    return;
  }
  const marks = selectedMarks();
  if (marks.length === 0) return;
  breakUndoGroup();
  useProjectStore.getState().apply(deleteMarks(marks.map((m) => m.id)));
  session().clearSelection();
}

export function duplicateSelection(): void {
  const outline = selectedOutline();
  if (outline) {
    const clip = outlineClipOf(project(), outline.kind, outline.ids);
    if (clip) pasteOutline(clip, { kind: outline.kind, id: outline.ids[outline.ids.length - 1]! });
    return;
  }
  addAndSelect(selectedMarks().map((mark) => cloneMark(mark, { nudgePt: CLONE_NUDGE_PT })));
}

/** Adds a vertex on the longest segment, or on the segment under a double-click. */
export function splitSelection(segmentIndex?: number, atNormalized?: { x: number; y: number }): void {
  const line = selectedMarks().find((mark) => mark.kind === "line");
  if (line) splitLine(line.id, segmentIndex, atNormalized);
}

/** Removes the middle vertex so two segments become one. */
export function rejoinSelection(): void {
  const line = selectedMarks().find((mark) => mark.kind === "line");
  if (line) rejoinLine(line.id);
}

/** Links the mark to a shot, or unlinks it when `shotId` is empty. Linking follows the shot. */
export function linkMarkToShot(markId: string, shotId: string): void {
  linkMarksToShot([markId], shotId);
}

/**
 * Links lines, notes and shapes to a shot, or unlinks them when `shotId` is
 * empty, as one undo step. A linked mark follows the shot's color and text.
 */
export function linkMarksToShot(markIds: string[], shotId: string): void {
  const p = project();
  breakUndoGroup();
  useProjectStore.getState().apply((current) =>
    markIds.reduce(
      (acc, id) =>
        updateMark(id, (mark) => {
          if (mark.kind === "image") return mark;
          if (!shotId) return mark.shotId ? unlinkMark(p, mark) : mark;
          if (mark.shotId === shotId || !findShot(p, shotId)) return mark;
          const next = structuredClone(mark);
          next.shotId = shotId;
          delete next.color;
          if (next.kind === "line") {
            delete next.own;
            delete next.caption.text;
          } else if (next.kind === "text") {
            delete next.own;
            delete next.text;
          }
          return next;
        })(acc),
      current
    )
  );
  breakUndoGroup();
}

/** The selected shots or scenes in the Scenes list, if that is what is selected. */
function selectedOutline(): { kind: "shot" | "scene"; ids: string[] } | null {
  const selection = session().selection;
  if (selection?.kind !== "shot" && selection?.kind !== "scene") return null;
  return selection.ids.length > 0 ? { kind: selection.kind, ids: selection.ids } : null;
}

/** Puts copies of shots or scenes after the anchor and selects the last copy. */
function pasteOutline(clip: OutlineClip, anchor: OutlineAnchor): void {
  let ids: string[] = [];
  breakUndoGroup();
  useProjectStore.getState().apply((p) => {
    const result = insertOutline(p, clip, anchor);
    ids = result.ids;
    return result.project;
  });
  breakUndoGroup();
  const last = ids[ids.length - 1];
  if (last) session().select(clip.kind === "shots" ? "shot" : "scene", last);
  else notify("Add a scene first, then paste the shots into it.");
}

export function copy(): void {
  const outline = selectedOutline();
  if (outline) {
    const clip = outlineClipOf(project(), outline.kind, outline.ids);
    if (clip) session().setOutlineClipboard(clip);
    return;
  }
  const marks = selectedMarks();
  if (marks.length > 0) session().setClipboard(structuredClone(marks));
}

/**
 * Pastes onto a page (the active page by default) at the original position,
 * nudged when the original is on that page. Pasted marks keep their shot link
 * while the shot still exists.
 */
export function paste(page: number = session().activePage, inPlace = false): void {
  const outlineClip = session().outlineClipboard;
  if (outlineClip) {
    const outline = selectedOutline();
    pasteOutline(outlineClip, outline ? { kind: outline.kind, id: outline.ids[outline.ids.length - 1]! } : null);
    return;
  }
  const clipboard = session().clipboard;
  if (!clipboard?.length) return;
  const p = project();
  addAndSelect(
    clipboard.map((mark) => {
      const nudgePt = !inPlace && mark.page === page ? CLONE_NUDGE_PT : 0;
      const copyOf = cloneMark(mark, { page, nudgePt });
      if (copyOf.kind !== "image" && copyOf.shotId && !findShot(p, copyOf.shotId)) {
        delete copyOf.shotId;
        if (copyOf.color === undefined) copyOf.color = p.settings.general.newShotColor;
        if (copyOf.kind === "text" && copyOf.text === undefined) copyOf.text = "";
      }
      return copyOf;
    })
  );
}

/** Paste at exactly the original position on the current page. */
export function pasteInPlace(): void {
  paste(session().activePage, true);
}

export function cut(): void {
  const outline = selectedOutline();
  if (outline) {
    void removeOutline(outline, "Cut");
    return;
  }
  if (selectedMarks().length === 0) return;
  copy();
  deleteSelection();
}

/** Deletes shots or scenes, copying them first for Cut. Their lines stay on the script, unlinked. */
async function removeOutline(outline: { kind: "shot" | "scene"; ids: string[] }, verb: "Cut" | "Delete"): Promise<void> {
  const p = project();
  const shotIds =
    outline.kind === "shot"
      ? outline.ids
      : p.scenes.filter((scene) => outline.ids.includes(scene.id)).flatMap((scene) => scene.shots.map((shot) => shot.id));
  const lineCount = p.marks.filter((mark) => mark.kind !== "image" && mark.shotId && shotIds.includes(mark.shotId)).length;
  if (lineCount > 0 && usePrefsStore.getState().confirmDeletes) {
    const what = outline.kind === "shot" ? (outline.ids.length === 1 ? "this shot" : "these shots") : outline.ids.length === 1 ? "this scene" : "these scenes";
    const message = `${verb} ${what}? ${lineCount} ${lineCount === 1 ? "line" : "lines"} will stay on the script, unlinked.`;
    if (!(await confirm(message, verb, true))) return;
  }
  if (verb === "Cut") copy();
  breakUndoGroup();
  for (const id of outline.ids) useProjectStore.getState().apply(outline.kind === "shot" ? deleteShot(id) : deleteScene(id));
  breakUndoGroup();
  session().clearSelection();
}

/** The shot behind the selection: a selected shot, or the shot a selected mark links to. */
function selectedShotFound() {
  const selection = session().selection;
  const p = project();
  if (selection?.kind === "shot") return findShot(p, selection.ids[0]);
  if (selection?.kind === "mark") {
    const mark = p.marks.find((m) => m.id === selection.ids[0]);
    return mark && mark.kind !== "image" ? findShot(p, mark.shotId) : null;
  }
  return null;
}

/** Ctrl+H: hides the selected shot (or a selected mark's shot), like its eye in the Scenes list. */
export function hideSelectedShot(): void {
  const selection = session().selection;
  // Several marks: every shot they link to.
  const shotIds =
    selection?.kind === "mark"
      ? [...new Set(project().marks.filter((m) => selection.ids.includes(m.id) && m.kind !== "image").map((m) => (m.kind === "image" ? undefined : m.shotId)))].filter(
          (id): id is string => !!id && !!findShot(project(), id)
        )
      : [selectedShotFound()?.shot.id].filter((id): id is string => !!id);
  if (shotIds.length === 0) return;
  breakUndoGroup();
  useProjectStore.getState().apply((current) => shotIds.reduce((acc, id) => updateShot(id, (shot) => ({ ...shot, visible: false }))(acc), current));
  breakUndoGroup();
  if (session().selection?.kind === "mark") session().clearSelection();
}

/** Ctrl+Shift+H: hides the scene of the selection (a scene, a shot, or a linked mark). */
export function hideSelectedScene(): void {
  const selection = session().selection;
  const sceneId = selection?.kind === "scene" ? selection.ids[0] : selectedShotFound()?.scene.id;
  if (!sceneId) return;
  breakUndoGroup();
  useProjectStore.getState().apply(updateScene(sceneId, (scene) => ({ ...scene, visible: false })));
  breakUndoGroup();
  if (session().selection?.kind === "mark") session().clearSelection();
}

/**
 * Ctrl+drag with the Line tool: makes a new shot for the line being drawn.
 * It goes after the selected shot (or the selected line's shot), at the end of
 * a selected scene, or at the end of the last scene; with no scenes, a scene
 * is made first. Leaves the undo group open so the line joins the same step.
 */
export function newShotForLine(): string {
  const p = project();
  const selection = session().selection;
  const anchor = selectedShotFound();
  const shot = createShot(p);
  breakUndoGroup();
  if (anchor) {
    useProjectStore.getState().apply(addShot(anchor.scene.id, shot, anchor.shotIndex + 1));
  } else {
    let sceneId = selection?.kind === "scene" ? selection.ids[0] : p.scenes[p.scenes.length - 1]?.id;
    if (!sceneId) {
      const scene = createScene();
      useProjectStore.getState().apply(addScene(scene));
      sceneId = scene.id;
    }
    useProjectStore.getState().apply(addShot(sceneId!, shot));
  }
  return shot.id;
}

/** Alt+H: shows every hidden shot and scene, and every row and column hidden in the table. */
export function showAllHidden(): void {
  const p = project();
  const anyHidden = p.scenes.some((scene) => !scene.visible || scene.shots.some((shot) => !shot.visible));
  if (anyHidden) {
    breakUndoGroup();
    useProjectStore.getState().apply((current) => ({
      ...current,
      scenes: current.scenes.map((scene) => ({ ...scene, visible: true, shots: scene.shots.map((shot) => (shot.visible ? shot : { ...shot, visible: true })) })),
    }));
    breakUndoGroup();
  }
  session().showAllTableRows();
  usePrefsStore.getState().showAllTableColumns();
}

export function deselect(): void {
  session().clearSelection();
}

export function hasMarkSelection(): boolean {
  return selectedMarks().length > 0;
}

/** Whether Delete has something to act on: marks, shots or scenes. */
export function hasDeletableSelection(): boolean {
  return selectedOutline() !== null || selectedMarks().length > 0;
}

/* ---------- view ---------- */

const ZOOM_STEP_PERCENT = 10;

export function zoomIn(): void {
  const prefs = usePrefsStore.getState();
  prefs.setViewerZoomPercent(prefs.viewerZoomPercent + ZOOM_STEP_PERCENT);
}

export function zoomOut(): void {
  const prefs = usePrefsStore.getState();
  prefs.setViewerZoomPercent(prefs.viewerZoomPercent - ZOOM_STEP_PERCENT);
}

/** 100% fits the current view in the script area. */
export function zoomToFit(): void {
  usePrefsStore.getState().setViewerZoomPercent(100);
}

export function setViewMode(mode: ViewerLayoutMode): void {
  usePrefsStore.getState().setViewerLayoutMode(mode);
  if (mode === "single") session().setActivePage(session().viewerPage);
}

/** Book spread: page 1 sits alone, like a title page. Saved with the project. */
export function setFirstPageAlone(firstPageAlone: boolean): void {
  breakUndoGroup();
  useProjectStore.getState().apply(
    updateSettings((settings) => ({ ...settings, drawing: { ...settings.drawing, firstPageAlone } }))
  );
}

export function toggleSnap(): void {
  const current = session();
  current.setSnapEnabled(!current.snapEnabled);
}

/* ---------- undo ---------- */

/** Drops a selection that points at something an undo or redo removed. */
function dropStaleSelection(): void {
  const selection = session().selection;
  if (!selection) return;
  const p = project();
  const exists = (id: string) =>
    selection.kind === "mark"
      ? p.marks.some((m) => m.id === id)
      : selection.kind === "shot"
        ? !!findShot(p, id)
        : p.scenes.some((s) => s.id === id);
  if (!selection.ids.every(exists)) session().clearSelection();
}

export function undo(): void {
  undoProject();
  dropStaleSelection();
}

export function redo(): void {
  redoProject();
  dropStaleSelection();
}
