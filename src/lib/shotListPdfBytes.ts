/*
 * Draws the shot list layout (model/shotListPdf.ts) into a new PDF.
 */
import { PDFDocument, StandardFonts, grayscale, rgb, type PDFFont } from "pdf-lib";
import { layoutShotList, type ShotListLayout, type ShotListPdfOptions } from "../model/shotListPdf";
import type { TableColumn } from "../model/shotTable";
import type { Project } from "../model/types";
import { resolvePdfExportFont } from "./pdfExportFonts";

type Fonts = { regular: PDFFont; bold: PDFFont };

/** Characters the font can draw; anything else is left out rather than failing the export. */
function cleaner(font: PDFFont): (text: string) => string {
  let supported: Set<number> | null = null;
  try {
    supported = new Set(font.getCharacterSet());
  } catch {
    supported = null;
  }
  const cache = new Map<string, boolean>();
  const ok = (ch: string) => {
    let known = cache.get(ch);
    if (known === undefined) {
      if (supported && supported.size > 0) known = supported.has(ch.codePointAt(0)!);
      else {
        try {
          font.encodeText(ch);
          known = true;
        } catch {
          known = false;
        }
      }
      cache.set(ch, known);
    }
    return known;
  };
  return (text: string) => [...text.replace(/\t/g, " ")].filter((ch) => ch === " " || ok(ch)).join("");
}

async function loadFonts(doc: PDFDocument, family: string): Promise<Fonts> {
  try {
    return {
      regular: await resolvePdfExportFont(doc, family, false),
      bold: await resolvePdfExportFont(doc, family, true),
    };
  } catch {
    // The bundled fonts could not load: the PDF's own Helvetica still works.
    return { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
  }
}

const hexColor = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1]!, 16) : 0x888888;
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

/** The layout with the export's real font metrics (also used for the dialog's page count). */
export async function shotListLayout(
  project: Project,
  options: ShotListPdfOptions,
  columns: TableColumn[],
  widthsRem: Record<string, number>,
  extra: { formatDate?: (iso: string) => string; printedOn?: string } = {}
): Promise<{ doc: PDFDocument; fonts: Fonts; layout: ShotListLayout; clean: { regular: (t: string) => string; bold: (t: string) => string } }> {
  const doc = await PDFDocument.create();
  const fonts = await loadFonts(doc, options.font);
  const clean = { regular: cleaner(fonts.regular), bold: cleaner(fonts.bold) };
  const measure = (text: string, size: number, bold: boolean) =>
    (bold ? fonts.bold : fonts.regular).widthOfTextAtSize((bold ? clean.bold : clean.regular)(text), size);
  const layout = layoutShotList(project, options, columns, widthsRem, measure, extra);
  return { doc, fonts, layout, clean };
}

export async function buildShotListPdfBytes(
  project: Project,
  options: ShotListPdfOptions,
  columns: TableColumn[],
  widthsRem: Record<string, number>,
  extra: { formatDate?: (iso: string) => string; printedOn?: string } = {}
): Promise<Uint8Array> {
  const { doc, fonts, layout, clean } = await shotListLayout(project, options, columns, widthsRem, extra);
  doc.setTitle(`${project.name || "Untitled"}: Shot list`);
  const H = layout.pageHeightPt;
  for (const ops of layout.pages) {
    const page = doc.addPage([layout.pageWidthPt, H]);
    for (const o of ops) {
      if (o.op === "fill") page.drawRectangle({ x: o.x, y: H - o.y - o.h, width: o.w, height: o.h, color: grayscale(o.gray) });
      else if (o.op === "line") page.drawLine({ start: { x: o.x1, y: H - o.y1 }, end: { x: o.x2, y: H - o.y2 }, thickness: o.widthPt, color: grayscale(o.gray) });
      else if (o.op === "box") page.drawRectangle({ x: o.x, y: H - o.y - o.size, width: o.size, height: o.size, borderColor: grayscale(0.25), borderWidth: o.widthPt });
      else if (o.op === "dot") page.drawCircle({ x: o.x, y: H - o.y, size: o.r, color: hexColor(o.color) });
      else {
        const text = (o.bold ? clean.bold : clean.regular)(o.text);
        if (text) page.drawText(text, { x: o.x, y: H - o.y, size: o.sizePt, font: o.bold ? fonts.bold : fonts.regular, color: grayscale(o.gray) });
      }
    }
  }
  return doc.save();
}
