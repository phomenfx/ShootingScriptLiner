import type { LabelLayout } from "../types/labelLayout";
import type { Project } from "../types/project";

export type NormPoint = { x: number; y: number };
export type PxPoint = { x: number; y: number };
export type PdfPoint = { x: number; y: number };

export function labelLayoutFromProject(project: Project): LabelLayout {
  return {
    labelOffsetXPt: project.labelOffsetXPt,
    labelOffsetYPt: project.labelOffsetYPt,
    labelSecondaryGapPt: project.labelSecondaryGapPt,
  };
}

export function normToPdf(nx: number, ny: number, pageW: number, pageH: number): PdfPoint {
  return { x: nx * pageW, y: (1 - ny) * pageH };
}

/** Viewer scale: screen pixels per PDF point (page height). */
export function viewerScalePxPerPt(canvasHeightPx: number, pageHeightPt: number): number {
  if (pageHeightPt <= 0) return 1;
  return canvasHeightPx / pageHeightPt;
}

export function primaryLabelPositionPdf(
  anchorNorm: NormPoint,
  pageW: number,
  pageH: number,
  layout: LabelLayout
): PdfPoint {
  const anchor = normToPdf(anchorNorm.x, anchorNorm.y, pageW, pageH);
  return {
    x: anchor.x + layout.labelOffsetXPt,
    y: anchor.y + layout.labelOffsetYPt,
  };
}

export function secondaryLabelPositionPdf(
  anchorNorm: NormPoint,
  pageW: number,
  pageH: number,
  fontSizePt: number,
  layout: LabelLayout
): PdfPoint {
  const anchor = normToPdf(anchorNorm.x, anchorNorm.y, pageW, pageH);
  return {
    x: anchor.x + layout.labelOffsetXPt,
    y: anchor.y - fontSizePt - layout.labelSecondaryGapPt,
  };
}

export function primaryLabelPositionPx(
  anchorPx: PxPoint,
  layout: LabelLayout,
  scalePxPerPt: number
): PxPoint {
  const ox = layout.labelOffsetXPt * scalePxPerPt;
  const oy = layout.labelOffsetYPt * scalePxPerPt;
  return {
    x: anchorPx.x + ox,
    y: anchorPx.y - oy,
  };
}

export function secondaryLabelPositionPx(
  anchorPx: PxPoint,
  fontSizePx: number,
  layout: LabelLayout,
  scalePxPerPt: number
): PxPoint {
  const ox = layout.labelOffsetXPt * scalePxPerPt;
  const gap = layout.labelSecondaryGapPt * scalePxPerPt;
  return {
    x: anchorPx.x + ox,
    y: anchorPx.y + fontSizePx + gap,
  };
}

export function labelFontWeight(bold: boolean): number {
  return bold ? 600 : 400;
}
