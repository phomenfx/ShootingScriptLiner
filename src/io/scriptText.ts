/*
 * The script's own text, page by page, as lines in reading order. Uses the
 * PDF's text layer only: a scanned script with no text gives empty pages.
 */
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import { piecesToLines, type PageText } from "../model/findText";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

type Item = { str: string; x: number; y: number; width: number };

/** Joins text pieces that share a baseline into lines, top to bottom. */
export function itemsToLines(items: Item[], tolerance = 2): string[] {
  const rows: { y: number; items: Item[] }[] = [];
  for (const item of items) {
    if (!item.str.trim()) continue;
    const row = rows.find((r) => Math.abs(r.y - item.y) <= tolerance);
    if (row) row.items.push(item);
    else rows.push({ y: item.y, items: [item] });
  }
  // PDF y grows upward, so the top line has the largest y.
  rows.sort((a, b) => b.y - a.y);
  return rows.map((row) => {
    const sorted = row.items.sort((a, b) => a.x - b.x);
    let text = "";
    let end = -Infinity;
    for (const item of sorted) {
      // A visible gap between pieces becomes a space.
      if (text && item.x - end > 1 && !text.endsWith(" ") && !item.str.startsWith(" ")) text += " ";
      text += item.str;
      end = item.x + item.width;
    }
    return text.trim();
  });
}

export async function readScriptLines(file: File): Promise<string[][]> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    const pages: string[][] = [];
    for (let n = 1; n <= doc.numPages; n += 1) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const items: Item[] = [];
      for (const raw of content.items) {
        if (!("str" in raw)) continue;
        items.push({ str: raw.str, x: raw.transform[4] as number, y: raw.transform[5] as number, width: raw.width });
      }
      pages.push(itemsToLines(items));
    }
    return pages;
  } finally {
    void doc.loadingTask.destroy();
  }
}

/** The script's text with where each piece sits on its page, for Find on script. */
export async function readScriptLayout(file: File): Promise<PageText[]> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    const pages: PageText[] = [];
    for (let n = 1; n <= doc.numPages; n += 1) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const pieces = [];
      for (const raw of content.items) {
        if (!("str" in raw) || !raw.str) continue;
        const [, , c, d, x, y] = raw.transform as number[];
        const size = Math.hypot(c!, d!) || 10;
        // Corners in page space (y up), turned into the viewport (y down), then into fractions.
        const [ax, ay] = viewport.convertToViewportPoint(x!, y! + size * 0.85);
        const [bx, by] = viewport.convertToViewportPoint(x! + raw.width, y! - size * 0.22);
        const [, base] = viewport.convertToViewportPoint(x!, y!);
        pieces.push({
          str: raw.str,
          x0: Math.min(ax!, bx!) / viewport.width,
          x1: Math.max(ax!, bx!) / viewport.width,
          top: Math.min(ay!, by!) / viewport.height,
          bottom: Math.max(ay!, by!) / viewport.height,
          baseline: base! / viewport.height,
        });
      }
      pages.push({ lines: piecesToLines(pieces) });
    }
    return pages;
  } finally {
    void doc.loadingTask.destroy();
  }
}
