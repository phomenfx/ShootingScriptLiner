import { type RefObject, useEffect, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  PDF_SPREAD_GAP_PX,
  scaleToFitTwoPages,
  viewerScaleFromZoomPercent,
} from "../lib/pdfViewport";

/** Per-page scale shared by single, scroll, and spread (each page = half pane width at 100%). */
export function usePdfPageScale(
  wrapRef: RefObject<HTMLElement | null>,
  pdf: PDFDocumentProxy | null,
  zoomPercent: number
) {
  const [pageWidthPt, setPageWidthPt] = useState(0);
  const [pageHeightPt, setPageHeightPt] = useState(0);
  const [scale, setScale] = useState(1);

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
    if (!el || pageWidthPt <= 0) return;

    const update = () => {
      const w = el.clientWidth - 32;
      const fit = scaleToFitTwoPages(pageWidthPt, w, PDF_SPREAD_GAP_PX);
      const zoom = viewerScaleFromZoomPercent(zoomPercent);
      const next = Math.max(0.2, Math.min(5, fit * zoom));
      setScale((prev) => (Math.abs(prev - next) < 0.002 ? prev : next));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [wrapRef, pageWidthPt, zoomPercent]);

  return { scale, pageWidthPt, pageHeightPt };
}
