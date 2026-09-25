import type { LabelLayout } from "../types/labelLayout";
import type { Project } from "../types/project";

export type NormPoint = { x: number; y: number };
export type PxPoint = { x: number; y: number };
export type PdfPoint = { x: number; y: number };

export function midpoint(a: PxPoint, b: PxPoint): PxPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Project settings, or a dragged label's offset from the line start. */
export function primaryLayoutForLine(
  line: { labelOffsetXPt?: number; labelOffsetYPt?: number },
  project: Project
): LabelLayout {
  const base = labelLayoutFromProject(project);
  return {
    labelOffsetXPt: line.labelOffsetXPt ?? base.labelOffsetXPt,
    labelOffsetYPt: line.labelOffsetYPt ?? base.labelOffsetYPt,
    labelSecondaryGapPt: base.labelSecondaryGapPt,
  };
}

/** Continuation label offset from the continuation end. */
export function secondaryLayoutForLine(
  line: { secondaryOffsetXPt?: number; secondaryGapPt?: number },
  project: Project
): LabelLayout {
  const base = labelLayoutFromProject(project);
  return {
    labelOffsetXPt: line.secondaryOffsetXPt ?? base.labelOffsetXPt,
    labelOffsetYPt: base.labelOffsetYPt,
    labelSecondaryGapPt: line.secondaryGapPt ?? base.labelSecondaryGapPt,
  };
}

/** Label origin is offset from the line start, including the settings default. */
export function primaryLabelAnchor<P extends { x: number; y: number }>(start: P): P {
  return start;
}

/** Continuation origin is offset from the continuation end. */
export function secondaryLabelAnchor<P extends { x: number; y: number }>(
  start: P,
  end: P,
  endIndex: 0 | 1
): P {
  return endIndex === 0 ? start : end;
}

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
