import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

export type PagePixelSize = { width: number; height: number };

export async function getPageSizeAtScale(
  page: PDFPageProxy,
  scale: number
): Promise<PagePixelSize> {
  const vp = page.getViewport({ scale });
  return { width: vp.width, height: vp.height };
}

export async function getFirstPageSizeAtScale(
  pdf: PDFDocumentProxy,
  scale: number
): Promise<PagePixelSize & { heightPt: number }> {
  const page = await pdf.getPage(1);
  const vp1 = page.getViewport({ scale: 1 });
  const size = await getPageSizeAtScale(page, scale);
  return { ...size, heightPt: vp1.height };
}

/** Scale so one page fits `targetWidth` px. */
export function scaleToFitWidth(pageWidthPt: number, targetWidth: number): number {
  if (pageWidthPt <= 0 || targetWidth <= 0) return 1.25;
  return targetWidth / pageWidthPt;
}

/** Scale so two pages (plus gap) fit `targetWidth` px. */
export function scaleToFitTwoPages(
  pageWidthPt: number,
  targetWidth: number,
  gapPx: number
): number {
  if (pageWidthPt <= 0 || targetWidth <= 0) return 1.25;
  const available = Math.max(1, targetWidth - gapPx);
  return available / (pageWidthPt * 2);
}

export const DEFAULT_VIEWER_SCALE = 1.25;
export const PDF_PAGE_GAP_PX = 16;
export const PDF_SPREAD_GAP_PX = 12;
