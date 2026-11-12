/**
 * Everything the user can do that is more than a field edit. Menus, buttons,
 * shortcuts and the action bar all call these, so each action has one
 * implementation.
 */
import { placeUnplacedV1Marks } from "../io/migrateV1";
import { buildProjectZip, downloadBlob, readProjectFile, scriptNameInJson } from "../io/projectFiles";
import { readProjectJson } from "../io/readProject";
import { compareScript, describeScript, scriptMismatchMessage } from "../io/scriptIdentity";
import { projectFileStem } from "../io/writeProject";
import { toLegacyProject } from "../legacy/legacyView";
import { loadPdfFromCache, savePdfToCache } from "../lib/pdfCache";
import { createProject } from "../model/defaults";
import { CLONE_NUDGE_PT, addMarks, cloneMark, deleteMarks, findShot, setScript } from "../model/edits";
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
import { useSessionStore } from "../stores/sessionStore";

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

/** Asks before doing something that cannot be taken back. Resolves false when declined. */
function confirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const unsubscribe = useSessionStore.subscribe((s) => {
      if (s.confirm === null) {
        unsubscribe();
        resolve(false);
      }
    });
    session().setConfirm({
      message,
      onYes: () => {
        unsubscribe();
        resolve(true);
      },
    });
  });
}

/* ---------- project files ---------- */

export function newProject(): void {
  session().reset();
  replaceProject(createProject());
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
      if (warning && !(await confirm(`${warning} Open anyway?`))) return;
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
      if (warning && !(await confirm(`${warning} Use this script anyway?`))) return;
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
  const { buildShotListRows, rowsToCsv } = await import("../lib/shotListExport");
  const csv = rowsToCsv(buildShotListRows(toLegacyProject(project())));
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

/** Opens the page of a shot's first mark and selects that mark. Returns false when it has none. */
export function jumpToShot(shotId: string): boolean {
  const mark = project().marks.find((m) => m.kind !== "image" && m.shotId === shotId);
  if (!mark) return false;
  session().setViewerPage(mark.page);
  session().setActivePage(mark.page);
  session().select("mark", mark.id);
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

export function copy(): void {
  const marks = selectedMarks();
  if (marks.length > 0) session().setClipboard(structuredClone(marks));
}

/**
 * Pastes onto a page (the active page by default) at the original position,
 * nudged when the original is on that page. Pasted marks keep their shot link
 * while the shot still exists.
 */
export function paste(page: number = session().activePage): void {
  const clipboard = session().clipboard;
  if (!clipboard?.length) return;
  const p = project();
  addAndSelect(
    clipboard.map((mark) => {
      const copyOf = cloneMark(mark, { page, nudgePt: mark.page === page ? CLONE_NUDGE_PT : 0 });
      if (copyOf.kind !== "image" && copyOf.shotId && !findShot(p, copyOf.shotId)) {
        delete copyOf.shotId;
        if (copyOf.color === undefined) copyOf.color = p.settings.general.newShotColor;
        if (copyOf.kind === "text" && copyOf.text === undefined) copyOf.text = "";
      }
      return copyOf;
    })
  );
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
