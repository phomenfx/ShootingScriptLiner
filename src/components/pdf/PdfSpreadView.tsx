import { spreadIndexFromPage, spreadSlots, type SpreadOptions } from "../../lib/pdfSpread";
import { usePdfPageScale } from "../../hooks/usePdfPageScale";
import { PDF_PAGE_PAD_X, PDF_PAGE_PAD_Y, PDF_SPREAD_GAP_PX } from "../../lib/pdfViewport";
import { PdfPageStack } from "./PdfPageStack";
import type { PDFDocumentProxy } from "pdfjs-dist";

type Props = {
  pdf: PDFDocumentProxy;
  pageCount: number;
  anchorPage: number;
  activePage: number;
  zoomPercent: number;
  onFocusPage: (page: number) => void;
  wrapRef: React.RefObject<HTMLDivElement | null>;
  spread?: SpreadOptions;
};

export function PdfSpreadView({
  pdf,
  pageCount,
  anchorPage,
  activePage,
  zoomPercent,
  onFocusPage,
  wrapRef,
  spread,
}: Props) {
  const spreadIndex = spreadIndexFromPage(anchorPage, spread);
  const [leftPage, rightPage] = spreadSlots(spreadIndex, pageCount, spread);
  const pagesAcross = (leftPage != null ? 1 : 0) + (rightPage != null ? 1 : 0) || 1;
  const { scale } = usePdfPageScale(wrapRef, pdf, zoomPercent, {
    pagesAcross,
    gapPx: pagesAcross > 1 ? PDF_SPREAD_GAP_PX : 0,
    padX: PDF_PAGE_PAD_X,
    padY: PDF_PAGE_PAD_Y,
  });

  const renderSlot = (pageNum: number | null) => {
    if (pageNum == null) return null;
    return (
      <div key={pageNum} className="pdf-spread-slot">
        <PdfPageStack
          pdf={pdf}
          pageNum={pageNum}
          scale={scale}
          isActive={activePage === pageNum}
          onFocus={() => onFocusPage(pageNum)}
          updatePageHeightPt={activePage === pageNum}
        />
      </div>
    );
  };

  return (
    <div className="pdf-canvas-wrap pdf-spread-wrap" ref={wrapRef}>
      <div className="pdf-spread-row">
        {renderSlot(leftPage)}
        {renderSlot(rightPage)}
      </div>
    </div>
  );
}
