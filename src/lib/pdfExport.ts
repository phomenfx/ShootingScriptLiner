import {
  PDFDocument,
  concatTransformationMatrix,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { Project } from "../types/project";
import { isLineAnnotation, isTextAnnotation, type TextAlign } from "../types/annotations";
import {
  getLineFontSizePt,
  getLineScriptLabels,
  getLineFontFamily,
  getLineLabelBold,
  getTextLabelBold,
  getTextDisplayText,
  resolveTextColor,
  lineEndIndexForContLabel,
  textIsVisible,
  resolveLineStyle,
} from "./annotationUtils";
import {
  normToPdf,
  primaryLabelAnchor,
  primaryLabelPositionPdf,
  primaryLayoutForLine,
  secondaryLabelAnchor,
  secondaryLabelPositionPdf,
  secondaryLayoutForLine,
} from "./labelLayout";
import { strokeDashPatternPdf } from "./lineStrokes";
import { drawPdfLineCap } from "./pdfLineCaps";
import { resolvePdfExportFont, sanitizePdfExportText } from "./pdfExportFonts";
import {
  UNDERLINE_THICKNESS_EM,
  italicBaselineMatrix,
  layoutTextBlock,
  pinBlockToOrigin,
} from "./textBox";

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

function drawWrappedPdfText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  left: number,
  baseline: number,
  fontSize: number,
  widthPt: number | undefined,
  align: TextAlign,
  underline: boolean,
  italic: boolean,
  color: ReturnType<typeof hexToRgb>,
  pinOrigin = false
) {
  const safe = sanitizePdfExportText(text);
  if (!safe) return;
  const laid = layoutTextBlock({
    text: safe,
    left,
    baseline,
    fontSize,
    width: widthPt,
    align,
    underline,
    yDown: false,
    measure: (sample) => font.widthOfTextAtSize(sample, fontSize),
  });
  const block = pinOrigin
    ? pinBlockToOrigin(laid, align, { x: left, y: baseline }, false)
    : laid;
  for (const run of block.runs) {
    if (run.text) {
      if (italic) {
        const matrix = italicBaselineMatrix(run.baseline);
        page.pushOperators(
          pushGraphicsState(),
          concatTransformationMatrix(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f)
        );
      }
      page.drawText(run.text, {
        x: run.x,
        y: run.baseline,
        size: fontSize,
        font,
        color,
      });
      if (italic) page.pushOperators(popGraphicsState());
    }
    if (run.underline) {
      page.drawLine({
        start: { x: run.underline.x1, y: run.underline.y },
        end: { x: run.underline.x2, y: run.underline.y },
        thickness: Math.max(0.4, fontSize * UNDERLINE_THICKNESS_EM),
        color,
      });
    }
  }
}

/** Draws coverage lines and text onto a copy of the script PDF. */
export async function buildLinedPdfBytes(
  project: Project,
  pdfBytes: ArrayBuffer
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

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
        const color = hexToRgb(style.color);
        const italic = line.labelItalic === true;
        const underline = line.labelUnderline === true;
        if (primaryText) {
          const parent = primaryLabelAnchor(line.points[0]);
          const pos = primaryLabelPositionPdf(
            parent,
            pw,
            ph,
            primaryLayoutForLine(line, project)
          );
          drawWrappedPdfText(
            page,
            labelFont,
            primaryText,
            pos.x,
            pos.y,
            fs,
            line.labelWidthPt,
            line.labelAlign ?? "left",
            underline,
            italic,
            color,
            true
          );
        }
        if (secondaryText) {
          const parent = secondaryLabelAnchor(
            line.points[0],
            line.points[1],
            lineEndIndexForContLabel(line)
          );
          const pos = secondaryLabelPositionPdf(
            parent,
            pw,
            ph,
            fs,
            secondaryLayoutForLine(line, project)
          );
          drawWrappedPdfText(
            page,
            labelFont,
            secondaryText,
            pos.x,
            pos.y,
            fs,
            line.secondaryWidthPt,
            line.secondaryAlign ?? "left",
            underline,
            italic,
            color,
            true
          );
        }
      }
    }

    for (const t of texts) {
      if (!isTextAnnotation(t) || !textIsVisible(t)) continue;
      const tp = normToPdf(t.x, t.y, pw, ph);
      const textFont = await getFont(
        t.fontFamily ?? project.defaultLine.fontFamily,
        getTextLabelBold(t, project),
        getTextDisplayText(t, project)
      );
      drawWrappedPdfText(
        page,
        textFont,
        getTextDisplayText(t, project),
        tp.x,
        tp.y,
        t.fontSize ?? 11,
        t.widthPt,
        t.align ?? "left",
        t.labelUnderline === true,
        t.labelItalic === true,
        hexToRgb(resolveTextColor(t, project))
      );
    }
  }

  return doc.save();
}
