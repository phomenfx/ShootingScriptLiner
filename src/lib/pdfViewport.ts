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

/** Inset around a fitted page, matching the script view padding. */
export const PDF_PAGE_PAD_X = 32;
export const PDF_PAGE_PAD_Y = 32;
/** Scroll view keeps a shorter inset so one page fills the visible area. */
export const PDF_SCROLL_PAD_Y = 16;

export type PageFit = {
  /** 1 for single and scroll. 1 or 2 for the open book spread. */
  pagesAcross: number;
  gapPx?: number;
  padX?: number;
  padY?: number;
};

/**
 * Scale that fits `pagesAcross` pages inside the script area, width and height.
 * A couple of pixels are held back so rounding does not open a scrollbar.
 */
export function scaleToFitBox(
  pageWidthPt: number,
  pageHeightPt: number,
  boxWidthPx: number,
  boxHeightPx: number,
  fit: PageFit
): number {
  if (pageWidthPt <= 0 || pageHeightPt <= 0) return 1;
  const across = Math.max(1, fit.pagesAcross);
  const gap = Math.max(0, fit.gapPx ?? 0);
  const availW = boxWidthPx - (fit.padX ?? 0) - (across - 1) * gap - 2;
  const availH = boxHeightPx - (fit.padY ?? 0) - 2;
  const fitW = availW > 0 ? availW / (pageWidthPt * across) : 0;
  const fitH = availH > 0 ? availH / pageHeightPt : 0;
  if (fitW > 0 && fitH > 0) return Math.min(fitW, fitH);
  if (fitW > 0) return fitW;
  if (fitH > 0) return fitH;
  return 1;
}

export const DEFAULT_VIEWER_SCALE = 1.25;
export const PDF_PAGE_GAP_PX = 16;
export const PDF_SPREAD_GAP_PX = 12;

/** Convert stored zoom percent to pdf.js viewport scale. */
export function viewerScaleFromZoomPercent(zoomPercent: number): number {
  const n = Number(zoomPercent);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return n / 100;
}
