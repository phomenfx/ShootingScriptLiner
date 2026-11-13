/*
 * The shot list as a printable table: which shots and columns, the paper, and
 * the layout of every page as simple drawing steps (top-left origin, points).
 * Drawing those steps into a PDF lives in lib/shotListPdfBytes.ts.
 */
import { formatEighths, sceneLength } from "./pageLength";
import { groupByDate, type TableColumn, type TableScene } from "./shotTable";
import { formatMinutes } from "./shotTable";
import type { Project, Scene, Shot } from "./types";

export type PaperId = "letter" | "legal" | "tabloid" | "a4" | "a3";

/** Portrait sizes in points. */
export const PAPERS: { id: PaperId; label: string; widthPt: number; heightPt: number }[] = [
  { id: "letter", label: "Letter (8.5 × 11 in)", widthPt: 612, heightPt: 792 },
  { id: "legal", label: "Legal (8.5 × 14 in)", widthPt: 612, heightPt: 1008 },
  { id: "tabloid", label: "Tabloid (11 × 17 in)", widthPt: 792, heightPt: 1224 },
  { id: "a4", label: "A4 (210 × 297 mm)", widthPt: 595.28, heightPt: 841.89 },
  { id: "a3", label: "A3 (297 × 420 mm)", widthPt: 841.89, heightPt: 1190.55 },
];

export type ShotListPdfOptions = {
  /** Columns to print, in order; null prints the table's shown columns. */
  columns: string[] | null;
  paper: PaperId;
  landscape: boolean;
  /** Fit the columns to the page width, or use `scalePct`. */
  fit: boolean;
  scalePct: number;
  /** Text size at 100%. */
  fontSizePt: number;
  font: string;
  groupBy: "scene" | "date";
  /** Each scene (or shoot day) starts on a new page. */
  newPagePerGroup: boolean;
  /** An empty box per shot for ticking it off on set. */
  checkbox: boolean;
  colorDot: boolean;
  /** Long text wraps onto more lines; otherwise it is cut short with "…". */
  wrap: boolean;
  /** Project name and date at the top, page numbers at the bottom. */
  titles: boolean;
  /** Shots whose eye is off (hidden on the script). */
  includeHidden: boolean;
  skipStatus: string[];
  skipPriority: string[];
  /** Scenes to print; null prints every scene. */
  sceneIds: string[] | null;
};

export const DEFAULT_SHOT_LIST_PDF: ShotListPdfOptions = {
  columns: null,
  paper: "letter",
  landscape: true,
  fit: true,
  scalePct: 100,
  fontSizePt: 9,
  font: "Arial",
  groupBy: "scene",
  newPagePerGroup: false,
  checkbox: true,
  colorDot: true,
  wrap: true,
  titles: true,
  includeHidden: false,
  skipStatus: [],
  skipPriority: [],
  sceneIds: null,
};

/* ---------- what prints ---------- */

export type PrintGroup = {
  /** "Scene 1  INT. KITCHEN - DAY", or a date. */
  title: string;
  meta: string;
  shots: { scene: Scene; shot: Shot }[];
};

const slug = (scene: Scene) =>
  [[scene.heading.indicator, scene.heading.location].filter(Boolean).join(" "), scene.heading.time].filter(Boolean).join(" - ");

/** Shots that print, grouped by scene or by shoot date. */
export function printGroups(project: Project, options: ShotListPdfOptions, formatDate: (iso: string) => string = (d) => d): PrintGroup[] {
  const sceneIds = options.sceneIds?.some((id) => project.scenes.some((s) => s.id === id)) ? options.sceneIds : null;
  const rows: TableScene[] = project.scenes
    .map((scene, sceneIndex) => ({
      scene,
      sceneIndex,
      hiddenByFilter: 0,
      shots: scene.shots.filter(
        (shot) =>
          (options.includeHidden || (shot.visible && scene.visible)) &&
          !options.skipStatus.includes(shot.status) &&
          !options.skipPriority.includes(shot.priority)
      ),
    }))
    .filter((r) => !sceneIds || sceneIds.includes(r.scene.id));

  const meta = (shots: Shot[]) => {
    const minutes = shots.reduce((n, s) => n + (s.estimatedMinutes ?? 0), 0);
    const length = sceneLength(project, shots.map((s) => s.id));
    return [
      `${shots.length} ${shots.length === 1 ? "shot" : "shots"}`,
      minutes ? `Est. ${formatMinutes(minutes)}` : "",
      length.lineCount ? `${formatEighths(length.eighths)} pgs` : "",
    ]
      .filter(Boolean)
      .join(" · ");
  };

  if (options.groupBy === "date") {
    return groupByDate(rows).map((g) => ({
      title: g.date ? formatDate(g.date) || g.date : "No date",
      meta: meta(g.items.map((i) => i.shot)),
      shots: g.items.map((i) => ({ scene: i.scene, shot: i.shot })),
    }));
  }
  return rows
    .filter((r) => r.shots.length > 0)
    .map((r) => ({
      title: `Scene ${r.sceneIndex + 1}${slug(r.scene) ? `   ${slug(r.scene)}` : ""}`,
      meta: meta(r.shots),
      shots: r.shots.map((shot) => ({ scene: r.scene, shot })),
    }));
}

/* ---------- layout ---------- */

export type Measure = (text: string, sizePt: number, bold: boolean) => number;

export type DrawOp =
  | { op: "fill"; x: number; y: number; w: number; h: number; gray: number }
  | { op: "line"; x1: number; y1: number; x2: number; y2: number; widthPt: number; gray: number }
  | { op: "box"; x: number; y: number; size: number; widthPt: number }
  | { op: "dot"; x: number; y: number; r: number; color: string }
  /** `y` is the text's baseline. */
  | { op: "text"; x: number; y: number; text: string; sizePt: number; bold: boolean; gray: number };

export type ShotListLayout = {
  pageWidthPt: number;
  pageHeightPt: number;
  pages: DrawOp[][];
  /** Columns that ran past the page edge and were left out. */
  dropped: string[];
  scale: number;
};

/** One rem of table width is 12 pt at 100%. */
const PT_PER_REM = 12;
const MARGIN = 36;
const FIT_GROW_LIMIT = 1.5;

/** Text broken into lines no wider than `width`. */
export function wrapText(text: string, width: number, measure: (t: string) => number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (measure(next) <= width) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      // A word wider than the cell breaks between letters.
      let rest = word;
      while (measure(rest) > width && rest.length > 1) {
        let n = rest.length - 1;
        while (n > 1 && measure(rest.slice(0, n)) > width) n--;
        lines.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines.length ? lines : [""];
}

/** Text cut short with "…" to fit `width`. */
export function clipText(text: string, width: number, measure: (t: string) => number): string {
  const flat = text.replace(/\s*\n\s*/g, " ");
  if (measure(flat) <= width) return flat;
  let n = flat.length;
  while (n > 0 && measure(`${flat.slice(0, n)}…`) > width) n--;
  return n > 0 ? `${flat.slice(0, n).trimEnd()}…` : "";
}

export function layoutShotList(
  project: Project,
  options: ShotListPdfOptions,
  columns: TableColumn[],
  widthsRem: Record<string, number>,
  measure: Measure,
  extra: { formatDate?: (iso: string) => string; printedOn?: string } = {}
): ShotListLayout {
  const paper = PAPERS.find((p) => p.id === options.paper) ?? PAPERS[0]!;
  const pageW = options.landscape ? paper.heightPt : paper.widthPt;
  const pageH = options.landscape ? paper.widthPt : paper.heightPt;
  const avail = pageW - MARGIN * 2;

  const natural = (options.checkbox ? 1.5 : 0) + columns.reduce((n, c) => n + (widthsRem[c.id] ?? c.width), 0);
  const s = options.fit ? Math.min(FIT_GROW_LIMIT, avail / (natural * PT_PER_REM)) : options.scalePct / 100;

  const size = options.fontSizePt * s;
  const lh = size * 1.25;
  const padX = 4 * s;
  const padY = 3 * s;
  const rule = Math.max(0.25, 0.5 * s);

  // Columns left to right until the page edge.
  const boxW = options.checkbox ? 1.5 * PT_PER_REM * s : 0;
  let x = MARGIN + boxW;
  const placed: { column: TableColumn; x: number; w: number }[] = [];
  const dropped: string[] = [];
  for (const column of columns) {
    const w = (widthsRem[column.id] ?? column.width) * PT_PER_REM * s;
    if (x + w > pageW - MARGIN + 0.5 || dropped.length) {
      dropped.push(column.label);
      continue;
    }
    placed.push({ column, x, w });
    x += w;
  }
  const tableW = x - MARGIN;

  const m = (bold: boolean, sz = size) => (t: string) => measure(t, sz, bold);
  const titleSize = size * 1.6;
  const footSize = size * 0.85;
  const top = MARGIN + (options.titles ? titleSize + size * 1.2 : 0);
  const bottom = pageH - MARGIN - (options.titles ? footSize + size : 0);

  const pages: DrawOp[][] = [];
  let ops: DrawOp[] = [];
  let y = top;

  const cellLines = (text: string, w: number, bold = false) =>
    options.wrap ? wrapText(text, w - padX * 2, m(bold)) : [clipText(text, w - padX * 2, m(bold))];

  const headerH = lh + padY * 2;
  const drawHeader = () => {
    ops.push({ op: "fill", x: MARGIN, y, w: tableW, h: headerH, gray: 0.9 });
    for (const p of placed) {
      ops.push({ op: "text", x: p.x + padX, y: y + padY + size, text: clipText(p.column.label, p.w - padX * 2, m(true)), sizePt: size, bold: true, gray: 0.15 });
    }
    gridLines(headerH);
    y += headerH;
  };
  const gridLines = (h: number) => {
    ops.push({ op: "line", x1: MARGIN, y1: y + h, x2: MARGIN + tableW, y2: y + h, widthPt: rule, gray: 0.7 });
    for (const p of placed) ops.push({ op: "line", x1: p.x, y1: y, x2: p.x, y2: y + h, widthPt: rule, gray: 0.8 });
    ops.push({ op: "line", x1: MARGIN, y1: y, x2: MARGIN, y2: y + h, widthPt: rule, gray: 0.8 });
    ops.push({ op: "line", x1: MARGIN + tableW, y1: y, x2: MARGIN + tableW, y2: y + h, widthPt: rule, gray: 0.8 });
  };
  const newPage = () => {
    if (ops.length) pages.push(ops);
    ops = [];
    y = top;
    ops.push({ op: "line", x1: MARGIN, y1: y, x2: MARGIN + tableW, y2: y, widthPt: rule, gray: 0.7 });
    drawHeader();
  };

  const groups = printGroups(project, options, extra.formatDate);
  newPage();
  const groupH = lh + padY * 2;
  groups.forEach((group, gi) => {
    const firstRowH = group.shots[0] ? rowHeight(group.shots[0]) : 0;
    const atTop = y === top + headerH;
    if ((options.newPagePerGroup && gi > 0 && !atTop) || y + groupH + firstRowH > bottom) newPage();
    ops.push({ op: "fill", x: MARGIN, y, w: tableW, h: groupH, gray: 0.82 });
    const title = clipText(group.title, tableW * 0.7, m(true));
    ops.push({ op: "text", x: MARGIN + padX, y: y + padY + size, text: title, sizePt: size, bold: true, gray: 0.1 });
    const tx = MARGIN + padX + measure(title, size, true) + size;
    ops.push({ op: "text", x: tx, y: y + padY + size, text: clipText(group.meta, MARGIN + tableW - tx - padX, m(false)), sizePt: size, bold: false, gray: 0.35 });
    ops.push({ op: "line", x1: MARGIN, y1: y + groupH, x2: MARGIN + tableW, y2: y + groupH, widthPt: rule, gray: 0.7 });
    y += groupH;

    for (const item of group.shots) {
      let h = rowHeight(item);
      if (y + h > bottom) newPage();
      // A row taller than a whole page is cut at the page bottom.
      h = Math.min(h, bottom - y);
      const cut = item.shot.status === "cut";
      const gray = cut ? 0.55 : 0.1;
      if (options.checkbox) {
        const box = Math.min(size, boxW - padX * 2);
        ops.push({ op: "box", x: MARGIN + (boxW - box) / 2, y: y + padY + (lh - box) / 2, size: box, widthPt: Math.max(0.5, 0.75 * s) });
      }
      for (const p of placed) {
        let cx = p.x + padX;
        let w = p.w;
        if (p.column.id === "shot" && options.colorDot) {
          const r = size * 0.3;
          ops.push({ op: "dot", x: cx + r, y: y + padY + lh / 2, r, color: item.shot.color });
          cx += r * 2 + size * 0.35;
          w -= r * 2 + size * 0.35;
        }
        const lines = cellLines(p.column.read(project, item.scene, item.shot).text, w);
        const fit = Math.max(1, Math.floor((h - padY * 2) / lh + 0.01));
        lines.slice(0, fit).forEach((line, i) => {
          if (line) ops.push({ op: "text", x: cx, y: y + padY + size + i * lh, text: line, sizePt: size, bold: p.column.id === "shot", gray });
        });
      }
      gridLines(h);
      if (options.checkbox) ops.push({ op: "line", x1: MARGIN + boxW, y1: y, x2: MARGIN + boxW, y2: y + h, widthPt: rule, gray: 0.8 });
      y += h;
    }
  });
  pages.push(ops);

  function rowHeight(item: { scene: Scene; shot: Shot }): number {
    if (!options.wrap) return lh + padY * 2;
    let lines = 1;
    for (const p of placed) {
      const w = p.column.id === "shot" && options.colorDot ? p.w - size * 0.95 : p.w;
      lines = Math.max(lines, cellLines(p.column.read(project, item.scene, item.shot).text, w).length);
    }
    return lines * lh + padY * 2;
  }

  // Titles and page numbers, now that the page count is known.
  if (options.titles) {
    pages.forEach((page, i) => {
      const name = project.name || "Untitled";
      page.push({ op: "text", x: MARGIN, y: MARGIN + titleSize, text: clipText(`${name}: Shot list`, avail * 0.7, m(true, titleSize)), sizePt: titleSize, bold: true, gray: 0.1 });
      if (extra.printedOn) {
        const w = measure(extra.printedOn, footSize, false);
        page.push({ op: "text", x: pageW - MARGIN - w, y: MARGIN + titleSize, text: extra.printedOn, sizePt: footSize, bold: false, gray: 0.4 });
      }
      const label = `Page ${i + 1} of ${pages.length}`;
      const w = measure(label, footSize, false);
      page.push({ op: "text", x: pageW - MARGIN - w, y: pageH - MARGIN, text: label, sizePt: footSize, bold: false, gray: 0.4 });
    });
  }

  return { pageWidthPt: pageW, pageHeightPt: pageH, pages, dropped, scale: s };
}
