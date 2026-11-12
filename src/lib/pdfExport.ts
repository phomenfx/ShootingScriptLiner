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
import { endingGeometry, shaftEnds } from "./geometry";
import { segmentStrands, type StrokeStrand } from "./strokeGeometry";
import { segmentLook } from "../model/segments";
import type { LineMark } from "../model/types";
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
  pdfBytes: ArrayBuffer,
  sourceLines: LineMark[] = []
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

  const fontCache = new Map<string, Awaited<ReturnType<typeof resolvePdfExportFont>>>();
  const sourceById = new Map(sourceLines.map((line) => [line.id, line]));
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
      const source = sourceById.get(line.id);
      const startNorm = line.points[0];
      const endNorm = line.points[line.points.length - 1];
      if (!startNorm || !endNorm || line.points.length < 2) continue;
      const pts = source
        ? source.points.map((point) => ({ x: point.x, y: ph - point.y }))
        : line.points.map((point) => normToPdf(point.x, point.y, pw, ph));
      const last = pts.length - 1;
      if (last < 1) continue;
      const ink = hexToRgb(style.color);
      const startInset = endingGeometry(style.start, style.widthPt)?.shaftInsetPt ?? 0;
      const endInset = endingGeometry(style.end, style.widthPt)?.shaftInsetPt ?? 0;
      for (let index = 0; index < last; index += 1) {
        const start = pts[index]!;
        const end = pts[index + 1]!;
        const look = source
          ? segmentLook(source, index)
          : { pattern: style.stroke === "solid" ? "straight" : style.stroke, widthPt: style.widthPt };
        const [shaftStart, shaftEnd] = shaftEnds(start, end, index === 0 ? startInset : 0, index === last - 1 ? endInset : 0);
        // Build strands with y pointing down, as on screen, so sided patterns land on the same side; then flip for the PDF.
        const flip = (point: { x: number; y: number }) => ({ x: point.x, y: ph - point.y });
        for (const strand of segmentStrands(flip(shaftStart), flip(shaftEnd), look.pattern, look.widthPt, look)) {
          if (strand.export) drawStrand(page, { ...strand, points: strand.points.map(flip) }, ink);
        }
      }

      const p0 = pts[0]!;
      const p1 = pts[last]!;
      const startAngle = Math.atan2(pts[1]!.y - p0.y, pts[1]!.x - p0.x);
      const endAngle = Math.atan2(p1.y - pts[last - 1]!.y, p1.x - pts[last - 1]!.x);
      drawPdfLineCap(page, p0.x, p0.y, startAngle, style.start, style.color, style.widthPt, true);
      drawPdfLineCap(page, p1.x, p1.y, endAngle, style.end, style.color, style.widthPt, false);

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
          const parent = primaryLabelAnchor(startNorm);
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
            startNorm,
            endNorm,
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

function drawStrand(page: PDFPage, strand: StrokeStrand, color: ReturnType<typeof hexToRgb>): void {
  const points = strand.points;
  if (points.length < 2) return;
  const paint = (start: StrokeStrand["points"][number], end: StrokeStrand["points"][number], dash?: number[]) => {
    page.drawLine({
      start,
      end,
      thickness: Math.max(0.25, strand.widthPt),
      color,
      opacity: strand.opacity,
      ...(dash ? { dashArray: dash } : {}),
    });
  };
  if (points.length === 2) {
    paint(points[0]!, points[1]!, strand.dash);
    return;
  }
  for (let index = 0; index < points.length - 1; index += 1) {
    paint(points[index]!, points[index + 1]!);
  }
}
