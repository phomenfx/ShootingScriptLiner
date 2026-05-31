import { spreadIndexFromPage, spreadSlots } from "../../lib/pdfSpread";
import { usePdfPageScale } from "../../hooks/usePdfPageScale";
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
};

export function PdfSpreadView({
  pdf,
  pageCount,
  anchorPage,
  activePage,
  zoomPercent,
  onFocusPage,
  wrapRef,
}: Props) {
  const { scale, pageWidthPt, pageHeightPt } = usePdfPageScale(wrapRef, pdf, zoomPercent);

  const spreadIndex = spreadIndexFromPage(anchorPage);
  const [leftPage, rightPage] = spreadSlots(spreadIndex, pageCount);

  const slotWidth = pageWidthPt * scale;
  const slotHeight = pageHeightPt * scale;

  const renderSlot = (pageNum: number | null, side: "left" | "right") => {
    if (pageNum == null) {
      return (
        <div
          key={`empty-${side}`}
          className="pdf-spread-slot pdf-spread-slot--empty"
          style={{ width: slotWidth || undefined, minHeight: slotHeight || undefined }}
          aria-hidden
        />
      );
    }
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
        {renderSlot(leftPage, "left")}
        {renderSlot(rightPage, "right")}
      </div>
    </div>
  );
}
