import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useMountedPageRange } from "../../hooks/useMountedPageRange";
import { usePdfPageScale } from "../../hooks/usePdfPageScale";
import {
  getFirstPageSizeAtScale,
  PDF_PAGE_GAP_PX,
} from "../../lib/pdfViewport";
import { PdfPageStack } from "./PdfPageStack";
import { useProjectStore } from "../../stores/projectStore";

type Props = {
  pdf: PDFDocumentProxy;
  pageCount: number;
  activePage: number;
  zoomPercent: number;
  scrollToPage: number | null;
  onScrollToPageDone: () => void;
  onFocusPage: (page: number) => void;
  wrapRef: React.RefObject<HTMLDivElement | null>;
};

export function PdfScrollView({
  pdf,
  pageCount,
  activePage,
  zoomPercent,
  scrollToPage,
  onScrollToPageDone,
  onFocusPage,
  wrapRef,
}: Props) {
  const slotRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [pageStridePx, setPageStridePx] = useState(0);
  const maxMountedPdfPages = useProjectStore((s) => s.maxMountedPdfPages);
  const { scale } = usePdfPageScale(wrapRef, pdf, zoomPercent);

  useEffect(() => {
    let cancelled = false;
    void getFirstPageSizeAtScale(pdf, scale).then((s) => {
      if (!cancelled) {
        setPageStridePx(s.height + PDF_PAGE_GAP_PX);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [pdf, scale]);

  const { start, end } = useMountedPageRange(
    wrapRef,
    pageCount,
    pageStridePx,
    maxMountedPdfPages
  );

  useEffect(() => {
    if (scrollToPage == null || scrollToPage < 1) return;
    const slot = slotRefs.current.get(scrollToPage);
    slot?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    onScrollToPageDone();
  }, [scrollToPage, onScrollToPageDone]);

  if (pageCount <= 0 || pageStridePx <= 0) {
    return (
      <div className="pdf-canvas-wrap pdf-scroll-wrap" ref={wrapRef}>
        <p className="pdf-hint">Loading pages…</p>
      </div>
    );
  }

  return (
    <div className="pdf-canvas-wrap pdf-scroll-wrap" ref={wrapRef}>
      <div className="pdf-scroll-column">
        {Array.from({ length: pageCount }, (_, i) => i + 1).map((pageNum) => {
          const mounted = pageNum >= start && pageNum <= end;
          return (
            <div
              key={pageNum}
              ref={(el) => {
                if (el) slotRefs.current.set(pageNum, el);
                else slotRefs.current.delete(pageNum);
              }}
              className="pdf-scroll-slot"
              style={{ minHeight: pageStridePx }}
            >
              {mounted ? (
                <PdfPageStack
                  pdf={pdf}
                  pageNum={pageNum}
                  scale={scale}
                  isActive={activePage === pageNum}
                  onFocus={() => onFocusPage(pageNum)}
                  updatePageHeightPt={activePage === pageNum}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
