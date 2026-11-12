import { type RefObject, useEffect, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { scaleToFitBox, viewerScaleFromZoomPercent, type PageFit } from "../lib/pdfViewport";

/** Page scale for the current view. 100% fits that view inside the script area. */
export function usePdfPageScale(
  wrapRef: RefObject<HTMLElement | null>,
  pdf: PDFDocumentProxy | null,
  zoomPercent: number,
  fit: PageFit
) {
  const [pageWidthPt, setPageWidthPt] = useState(0);
  const [pageHeightPt, setPageHeightPt] = useState(0);
  const [scale, setScale] = useState(1);
  const pagesAcross = fit.pagesAcross;
  const gapPx = fit.gapPx ?? 0;
  const padX = fit.padX ?? 0;
  const padY = fit.padY ?? 0;

  useEffect(() => {
    if (!pdf) {
      setPageWidthPt(0);
      setPageHeightPt(0);
      return;
    }
    let cancelled = false;
    void pdf.getPage(1).then((page) => {
      if (cancelled) return;
      const vp = page.getViewport({ scale: 1 });
      setPageWidthPt(vp.width);
      setPageHeightPt(vp.height);
    });
    return () => {
      cancelled = true;
    };
  }, [pdf]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || pageWidthPt <= 0 || pageHeightPt <= 0) return;

    const update = () => {
      const fitted = scaleToFitBox(pageWidthPt, pageHeightPt, el.clientWidth, el.clientHeight, {
        pagesAcross,
        gapPx,
        padX,
        padY,
      });
      const zoom = viewerScaleFromZoomPercent(zoomPercent);
      const next = Math.max(0.2, Math.min(5, fitted * zoom));
      setScale((prev) => (Math.abs(prev - next) < 0.002 ? prev : next));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [wrapRef, pageWidthPt, pageHeightPt, zoomPercent, pagesAcross, gapPx, padX, padY]);

  return { scale, pageWidthPt, pageHeightPt };
}
