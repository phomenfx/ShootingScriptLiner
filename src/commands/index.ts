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
import { createProject } from "../model/defaults";
import { CLONE_NUDGE_PT, addMarks, cloneMark, deleteMarks, findShot, setScript, unlinkMark, updateMark, updateSettings } from "../model/edits";
import type { Mark, Project, ScriptInfo } from "../model/types";
import {
  applyWithoutUndo,
  breakUndoGroup,
  markProjectSaved,
  redoProject,
  replaceProject,
  undoProject,
  useProjectStore,
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
    const bytes = await buildLinedPdfBytes(toLegacyProject(project()), await pdfFile.arrayBuffer());
    downloadBlob(new Blob([bytes], { type: "application/pdf" }), `${projectFileStem(project())}-lined.pdf`);
  } catch (error) {
    notify(
      error instanceof Error && error.message.includes("font")
        ? error.message
        : "Could not export the PDF. Check that the font files are in public/fonts/."
    );
  }
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
  const marks = selectedMarks();
  if (marks.length === 0) return;
  breakUndoGroup();
  useProjectStore.getState().apply(deleteMarks(marks.map((m) => m.id)));
  session().clearSelection();
}

export function duplicateSelection(): void {
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
  const p = project();
  breakUndoGroup();
  useProjectStore.getState().apply(
    updateMark(markId, (mark) => {
      if (mark.kind !== "line" && mark.kind !== "text") return mark;
      if (!shotId) return mark.shotId ? unlinkMark(p, mark) : mark;
      if (mark.shotId === shotId || !findShot(p, shotId)) return mark;
      const next = structuredClone(mark);
      next.shotId = shotId;
      delete next.color;
      delete next.own;
      if (next.kind === "line") delete next.caption.text;
      else delete next.text;
      return next;
    })
  );
}

export function copy(): void {
  const marks = selectedMarks();
  if (marks.length > 0) session().setClipboard(structuredClone(marks));
}

/**
 * Pastes onto a page (the active page by default) at the original position,
 * nudged when the original is on that page. Pasted marks keep their shot link
 * while the shot still exists.
 */
export function paste(page: number = session().activePage, inPlace = false): void {
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
  if (selectedMarks().length === 0) return;
  copy();
  deleteSelection();
}

export function deselect(): void {
  session().clearSelection();
}

export function hasMarkSelection(): boolean {
  return selectedMarks().length > 0;
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
