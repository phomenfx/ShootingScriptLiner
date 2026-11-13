import {
  BlendMode,
  PDFDocument,
  concatTransformationMatrix,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { Project } from "../types/project";
import { isLineAnnotation, isTextAnnotation, type LineCap, type TextAlign } from "../types/annotations";
import {
  getLineFontSizePt,
  getLineScriptLabels,
  getLineFontFamily,
  getLineLabelBold,
  getTextLabelBold,
  getTextDisplayText,
  resolveTextColor,
  lineEndIndexForContLabel,
  isAnnotationVisible,
  isTextShown,
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
import { legacyEnding } from "../legacy/legacyView";
import { segmentStrands, type StrokeStrand } from "./strokeGeometry";
import { segmentLook } from "../model/segments";
import type { LineMark, Project as V2Project, ShapeMark } from "../model/types";
import { isShapeShown, outlineEdges, shapeColor, shapeFill, shapeHalo, shapeHasStroke, shapeOutline, stampScalePercent, stampTip } from "./shapeGeometry";
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
  sourceLines: LineMark[] = [],
  /** The saved project, for box shapes. */
  source?: V2Project
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

    // Shapes go under lines and notes, as on screen.
    if (source) {
      for (const mark of source.marks) {
        if (mark.kind === "shape" && mark.page === pageNum && isShapeShown(source, mark)) drawShape(page, ph, source, mark);
      }
    }

    // Hidden shots and scenes stay out of the PDF, as they are off the page on screen.
    const lines = project.annotations.filter(
      (a) => isLineAnnotation(a) && a.page === pageNum && isAnnotationVisible(project, a)
    );
    const texts = project.annotations.filter(
      (a) => isTextAnnotation(a) && a.page === pageNum && isTextShown(project, a)
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
      if (source?.mid) {
        const mid = legacyEnding(source.mid);
        for (let index = 1; index < last; index += 1) {
          const at = pts[index]!;
          const before = pts[index - 1]!;
          drawPdfLineCap(page, at.x, at.y, Math.atan2(at.y - before.y, at.x - before.x), mid, style.color, style.widthPt, false);
        }
      }

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
      if (!isTextAnnotation(t)) continue;
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

/** One box shape. Points are built top-down like the page, then flipped for the PDF. */
function drawShape(page: PDFPage, ph: number, source: V2Project, shape: ShapeMark): void {
  const color = shapeColor(source, shape);
  const ink = hexToRgb(color);
  const flip = (point: { x: number; y: number }) => ({ x: point.x, y: ph - point.y });
  const widthPt = shape.stroke?.widthPt ?? 2;
  if (shape.shape === "stamp") {
    const tip = flip(stampTip(shape));
    const ending = { cap: (shape.stamp ?? "arrow") as LineCap, scalePercent: stampScalePercent(shape), filled: !!shape.fill };
    const angle = (-shape.rotation * Math.PI) / 180;
    const halo = shapeHalo(shape);
    if (halo) drawPdfLineCap(page, tip.x, tip.y, angle, ending, halo.color, widthPt, false, halo.widthPt);
    drawPdfLineCap(page, tip.x, tip.y, angle, ending, color, widthPt, false);
    return;
  }
  const outline = shapeOutline(shape);
  if (!outline) return;
  const fill = shapeFill(source, shape);
  const halo = shapeHalo(shape);
  const hasStroke = shapeHasStroke(shape) && !!shape.stroke;
  const d = outline.points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + (outline.closed ? " Z" : "");
  // A fill with no stroke still gets its outline around the edge.
  if (halo && !hasStroke && fill && outline.closed) {
    page.drawSvgPath(d, { x: 0, y: ph, borderColor: hexToRgb(halo.color), borderWidth: halo.widthPt * 2 });
  }
  if (fill && outline.closed) {
    // drawSvgPath reads y downward from the given origin, so the page points go in as they are.
    page.drawSvgPath(d, {
      x: 0,
      y: ph,
      color: hexToRgb(fill.color),
      opacity: fill.opacity,
      borderWidth: 0,
      ...(shape.shape === "highlight" ? { blendMode: BlendMode.Multiply } : {}),
    });
  }
  if (!hasStroke) return;
  const stroke = shape.stroke!;
  const strands = outlineEdges(outline)
    .flatMap(([a, b]) => segmentStrands(a, b, stroke.pattern, stroke.widthPt, stroke))
    .filter((strand) => strand.export)
    .map((strand) => ({ ...strand, points: strand.points.map(flip) }));
  // The halo goes down first, under every stroke.
  if (halo) {
    const haloInk = hexToRgb(halo.color);
    for (const strand of strands) drawStrand(page, { ...strand, widthPt: strand.widthPt + halo.widthPt * 2 }, haloInk);
  }
  for (const strand of strands) drawStrand(page, strand, ink);
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
