import { describe, expect, it } from "vitest";
import { createProject, createScene, createShot } from "./defaults";
import { DEFAULT_PDF_OPTIONS, markPrints, pagesToKeep, parsePageRange } from "./pdfOptions";
import type { Mark, Project } from "./types";

function sample(): { project: Project; marks: Record<string, Mark> } {
  const project = createProject();
  const one = createScene();
  const two = createScene();
  one.shots = [{ ...createShot(project), id: "keep", status: "planned", priority: "must" }, { ...createShot(project), id: "cut", status: "cut" }];
  two.shots = [{ ...createShot(project), id: "low", priority: "low" }];
  project.scenes = [one, two];
  const line = (id: string, shotId: string | undefined, page: number) => ({ id, kind: "line", page, shotId }) as unknown as Mark;
  const marks = {
    keep: line("a", "keep", 1),
    cut: line("b", "cut", 2),
    low: line("c", "low", 3),
    free: line("d", undefined, 4),
    note: { id: "n", kind: "text", page: 1, shotId: "keep" } as unknown as Mark,
  };
  project.marks = Object.values(marks);
  return { project, marks };
}

describe("PDF export options", () => {
  it("leaves out shots by status, priority and scene, and unlinked marks on request", () => {
    const { project, marks } = sample();
    const o = { ...DEFAULT_PDF_OPTIONS, skipStatus: ["cut"], skipPriority: ["low"] };
    expect(markPrints(project, marks.keep, o)).toBe(true);
    expect(markPrints(project, marks.cut, o)).toBe(false);
    expect(markPrints(project, marks.low, o)).toBe(false);
    expect(markPrints(project, marks.free, { ...o, include: { ...o.include, unlinked: false } })).toBe(false);
    expect(markPrints(project, marks.keep, { ...o, sceneIds: [project.scenes[1]!.id] })).toBe(false);
    expect(markPrints(project, marks.note, { ...o, include: { ...o.include, notes: false } })).toBe(false);
  });

  it("keeps all pages, only marked pages, or a range", () => {
    const { project } = sample();
    expect(parsePageRange("2-3, 5, 9-7, x", 8)).toEqual([2, 3, 5, 7, 8]);
    const o = { ...DEFAULT_PDF_OPTIONS, skipStatus: ["cut"] };
    expect(pagesToKeep(project, { ...o, pages: "marked" }, 6, () => true)).toEqual([1, 3, 4]);
    expect(pagesToKeep(project, { ...o, pages: "range", range: "2-3" }, 6, () => true)).toEqual([2, 3]);
    expect(pagesToKeep(project, o, 3, () => true)).toEqual([1, 2, 3]);
  });
});
