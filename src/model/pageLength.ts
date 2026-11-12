/**
 * How much script a set of lines covers, in eighths of a page. Where lines
 * overlap on a page, the overlap is counted once.
 */
import type { LineMark, Mark, Project } from "./types";

export type PageLength = {
  lineCount: number;
  /** Pages with at least one line, in order. */
  pages: number[];
  eighths: number;
};

const FALLBACK_HEIGHT_PT = 792;

function measure(project: Project, lines: LineMark[]): PageLength {
  const spans = new Map<number, [number, number][]>();
  for (const line of lines) {
    const height = project.script?.pages[line.page - 1]?.heightPt ?? FALLBACK_HEIGHT_PT;
    const ys = line.points.map((p) => Math.max(0, Math.min(height, p.y)) / height);
    const list = spans.get(line.page) ?? [];
    list.push([Math.min(...ys), Math.max(...ys)]);
    spans.set(line.page, list);
  }
  let covered = 0;
  for (const list of spans.values()) {
    list.sort((a, b) => a[0] - b[0]);
    let end = -1;
    for (const [from, to] of list) {
      if (to <= end) continue;
      covered += to - Math.max(from, end);
      end = to;
    }
  }
  const eighths = lines.length === 0 ? 0 : Math.max(1, Math.round(covered * 8));
  return { lineCount: lines.length, pages: [...spans.keys()].sort((a, b) => a - b), eighths };
}

const isLine = (mark: Mark): mark is LineMark => mark.kind === "line";

export function lineLength(project: Project, line: LineMark): PageLength {
  return measure(project, [line]);
}

export function shotLength(project: Project, shotId: string): PageLength {
  return measure(project, project.marks.filter(isLine).filter((line) => line.shotId === shotId));
}

export function sceneLength(project: Project, shotIds: string[]): PageLength {
  const ids = new Set(shotIds);
  return measure(project, project.marks.filter(isLine).filter((line) => line.shotId && ids.has(line.shotId)));
}

/** Eighths the way a script supervisor writes them: 3/8, 1, 1 2/8. */
export function formatEighths(eighths: number): string {
  const whole = Math.floor(eighths / 8);
  const rest = eighths % 8;
  if (whole === 0) return `${rest}/8`;
  return rest === 0 ? String(whole) : `${whole} ${rest}/8`;
}

export function formatPageRange(pages: number[]): string {
  if (pages.length === 0) return "";
  const first = pages[0]!;
  const last = pages[pages.length - 1]!;
  return first === last ? `page ${first}` : `pages ${first}–${last}`;
}

/** "3 lines · pages 2–4 · 1 3/8 pgs", or "Not on script". */
export function describeLength(length: PageLength): string {
  if (length.lineCount === 0) return "Not on script";
  return [
    `${length.lineCount} line${length.lineCount === 1 ? "" : "s"}`,
    formatPageRange(length.pages),
    `${formatEighths(length.eighths)} pgs`,
  ].join(" · ");
}
