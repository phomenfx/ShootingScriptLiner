/*
 * What goes into the exported lined PDF: which shots (by status, priority and
 * scene), which kinds of marks, and which pages. Hidden shots never print.
 */
import { findShot } from "./edits";
import type { Mark, Project } from "./types";

export type PdfExportOptions = {
  /** Statuses and priorities left out ("cut", "low", …). */
  skipStatus: string[];
  skipPriority: string[];
  /** Scenes to print; null prints every scene. */
  sceneIds: string[] | null;
  include: { lines: boolean; captions: boolean; notes: boolean; shapes: boolean; unlinked: boolean };
  /** "all", "marked" (pages with something printed), or a range like "2-5, 8". */
  pages: "all" | "marked" | "range";
  range: string;
};

export const DEFAULT_PDF_OPTIONS: PdfExportOptions = {
  skipStatus: [],
  skipPriority: [],
  sceneIds: null,
  include: { lines: true, captions: true, notes: true, shapes: true, unlinked: true },
  pages: "all",
  range: "",
};

/** Whether a mark prints with these options (its shot's eye is checked separately). */
export function markPrints(project: Project, mark: Mark, options: PdfExportOptions): boolean {
  if (mark.kind === "line" && !options.include.lines) return false;
  if (mark.kind === "text" && !options.include.notes) return false;
  if (mark.kind === "shape" && !options.include.shapes) return false;
  const shotId = mark.kind === "image" ? undefined : mark.shotId;
  const found = shotId ? findShot(project, shotId) : null;
  if (!found) return options.include.unlinked;
  if (options.skipStatus.includes(found.shot.status)) return false;
  if (options.skipPriority.includes(found.shot.priority)) return false;
  if (options.sceneIds && !options.sceneIds.includes(found.scene.id)) return false;
  return true;
}

/** "2-5, 8" → [2, 3, 4, 5, 8] within the page count; anything unreadable is ignored. */
export function parsePageRange(text: string, pageCount: number): number[] {
  const pages = new Set<number>();
  for (const part of text.split(/[,;\s]+/)) {
    const m = /^(\d+)(?:\s*[-–]\s*(\d+))?$/.exec(part.trim());
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let p = Math.max(1, Math.min(a, b)); p <= Math.min(pageCount, Math.max(a, b)); p += 1) pages.add(p);
  }
  return [...pages].sort((x, y) => x - y);
}

/** The pages to keep in the exported file. */
export function pagesToKeep(project: Project, options: PdfExportOptions, pageCount: number, isShown: (mark: Mark) => boolean): number[] {
  const all = Array.from({ length: pageCount }, (_, i) => i + 1);
  if (options.pages === "range") {
    const picked = parsePageRange(options.range, pageCount);
    return picked.length ? picked : all;
  }
  if (options.pages === "marked") {
    const marked = new Set(project.marks.filter((m) => isShown(m) && markPrints(project, m, options)).map((m) => m.page));
    return all.filter((p) => marked.has(p));
  }
  return all;
}
