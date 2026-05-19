import { PDFDocument, rgb } from "pdf-lib";
import type { Project } from "../types/project";
import { isLineAnnotation, isTextAnnotation } from "../types/annotations";
import {
  getLineFontSizePt,
  getLineScriptLabels,
  getLineFontFamily,
  getLineLabelBold,
  getTextLabelBold,
  lineEndIndexForContLabel,
  resolveLineStyle,
} from "./annotationUtils";
import {
  labelLayoutFromProject,
  normToPdf,
  primaryLabelPositionPdf,
  secondaryLabelPositionPdf,
} from "./labelLayout";
import { strokeDashPatternPdf } from "./lineStrokes";
import { drawPdfLineCap } from "./pdfLineCaps";
import { resolvePdfExportFont, sanitizePdfExportText } from "./pdfExportFonts";

function hexToRgb(hex: string) {
  const h = hex.replace("#", "").trim();
  if (h.length === 3) {
    return rgb(
      parseInt(h[0]! + h[0], 16) / 255,
      parseInt(h[1]! + h[1], 16) / 255,
      parseInt(h[2]! + h[2], 16) / 255
    );
  }
  if (h.length !== 6) return rgb(0, 0, 0);
  return rgb(
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255
  );
}

/** Draws coverage lines and text onto a copy of the script PDF. */
export async function buildLinedPdfBytes(
  project: Project,
  pdfBytes: ArrayBuffer
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const layout = labelLayoutFromProject(project);

  const fontCache = new Map<string, Awaited<ReturnType<typeof resolvePdfExportFont>>>();
  const getFont = async (fontFamily: string, bold: boolean, sampleText?: string) => {
    const key = `${fontFamily}\0${bold}`;
    let font = fontCache.get(key);
    if (!font) {
      font = await resolvePdfExportFont(doc, fontFamily, bold, sampleText);
      fontCache.set(key, font);
    }
    return font;
  };

  const pageCount = doc.getPageCount();
  for (let i = 0; i < pageCount; i++) {
    const page = doc.getPage(i);
    const pw = page.getWidth();
    const ph = page.getHeight();
    const pageNum = i + 1;

    const lines = project.annotations.filter(
      (a) => isLineAnnotation(a) && a.page === pageNum
    );
    const texts = project.annotations.filter(
      (a) => isTextAnnotation(a) && a.page === pageNum
    );

    for (const line of lines) {
      if (!isLineAnnotation(line)) continue;
      const style = resolveLineStyle(line, project);
      const dash = strokeDashPatternPdf(style.stroke, style.widthPt);
      const p0 = normToPdf(line.points[0].x, line.points[0].y, pw, ph);
      const p1 = normToPdf(line.points[1].x, line.points[1].y, pw, ph);
      page.drawLine({
        start: p0,
        end: p1,
        thickness: Math.max(0.5, style.widthPt),
        color: hexToRgb(style.color),
        dashArray: dash,
      });

      const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
      drawPdfLineCap(page, p0.x, p0.y, angle, style.start, style.color, style.widthPt, true);
      drawPdfLineCap(page, p1.x, p1.y, angle, style.end, style.color, style.widthPt, false);

      if (line.showLabel) {
        const { primary, secondary } = getLineScriptLabels(line, project);
        const fs = getLineFontSizePt(line, project);
        const primaryText = primary ? sanitizePdfExportText(primary) : "";
        const secondaryText = secondary ? sanitizePdfExportText(secondary) : "";
        const labelSample = `${primaryText}${secondaryText}` || "Aa0";
        const labelFont = await getFont(
          getLineFontFamily(line, project),
          getLineLabelBold(line, project),
          labelSample
        );
        if (primaryText) {
          const pos = primaryLabelPositionPdf(line.points[0], pw, ph, layout);
          page.drawText(primaryText, {
            x: pos.x,
            y: pos.y,
            size: fs,
            font: labelFont,
            color: hexToRgb(style.color),
          });
        }
        if (secondaryText) {
          const ei = lineEndIndexForContLabel(line);
          const pos = secondaryLabelPositionPdf(line.points[ei], pw, ph, fs, layout);
          page.drawText(secondaryText, {
            x: pos.x,
            y: pos.y,
            size: fs,
            font: labelFont,
            color: hexToRgb(style.color),
          });
        }
      }
    }

    for (const t of texts) {
      if (!isTextAnnotation(t)) continue;
      const tp = normToPdf(t.x, t.y, pw, ph);
      const singleLine = sanitizePdfExportText(t.text.replace(/\s+/g, " ").trim() || " ");
      const textFont = await getFont(
        t.fontFamily ?? project.defaultLine.fontFamily,
        getTextLabelBold(t, project)
      );
      page.drawText(singleLine, {
        x: tp.x,
        y: tp.y,
        size: t.fontSize ?? 11,
        font: textFont,
        color: hexToRgb(t.color),
      });
    }
  }

  return doc.save();
}
