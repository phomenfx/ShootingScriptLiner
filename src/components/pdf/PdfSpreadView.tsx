import { useEffect, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { pagesInSpread, spreadIndexFromPage } from "../../lib/pdfSpread";
import {
  PDF_SPREAD_GAP_PX,
  scaleToFitTwoPages,
  scaleToFitWidth,
} from "../../lib/pdfViewport";
import { PdfPageStack } from "./PdfPageStack";

type Props = {
  pdf: PDFDocumentProxy;
  pageCount: number;
  anchorPage: number;
  activePage: number;
  onFocusPage: (page: number) => void;
  wrapRef: React.RefObject<HTMLDivElement | null>;
};

export function PdfSpreadView({
  pdf,
  pageCount,
  anchorPage,
  activePage,
  onFocusPage,
  wrapRef,
}: Props) {
  const [scale, setScale] = useState(1);
  const [pageWidthPt, setPageWidthPt] = useState(0);

  const spreadIndex = spreadIndexFromPage(anchorPage);
  const visiblePages = pagesInSpread(spreadIndex, pageCount);

  useEffect(() => {
    let cancelled = false;
    void pdf.getPage(1).then((page) => {
      if (cancelled) return;
      setPageWidthPt(page.getViewport({ scale: 1 }).width);
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
      const next =
        visiblePages.length >= 2
          ? scaleToFitTwoPages(pageWidthPt, w, PDF_SPREAD_GAP_PX)
          : scaleToFitWidth(pageWidthPt, w);
      setScale(Math.max(0.35, Math.min(2, next)));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [wrapRef, pageWidthPt, visiblePages.length]);

  return (
    <div className="pdf-canvas-wrap pdf-spread-wrap" ref={wrapRef}>
      <div className="pdf-spread-row">
        {visiblePages.map((pageNum) => (
          <PdfPageStack
            key={pageNum}
            pdf={pdf}
            pageNum={pageNum}
            scale={scale}
            isActive={activePage === pageNum}
            onFocus={() => onFocusPage(pageNum)}
            updatePageHeightPt={activePage === pageNum}
          />
        ))}
      </div>
    </div>
  );
}
