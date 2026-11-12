import type { PDFDocumentProxy } from "pdfjs-dist";
import { usePdfPageScale } from "../../hooks/usePdfPageScale";
import { PDF_PAGE_PAD_X, PDF_PAGE_PAD_Y } from "../../lib/pdfViewport";
import { PdfPageStack } from "./PdfPageStack";

type Props = {
  pdf: PDFDocumentProxy;
  pageNum: number;
  zoomPercent: number;
  isActive: boolean;
  onFocus: () => void;
  wrapRef: React.RefObject<HTMLDivElement | null>;
};

export function PdfSingleView({
  pdf,
  pageNum,
  zoomPercent,
  isActive,
  onFocus,
  wrapRef,
}: Props) {
  const { scale } = usePdfPageScale(wrapRef, pdf, zoomPercent, {
    pagesAcross: 1,
    padX: PDF_PAGE_PAD_X,
    padY: PDF_PAGE_PAD_Y,
  });

  return (
    <div className="pdf-canvas-wrap pdf-single-wrap" ref={wrapRef}>
      <PdfPageStack
        pdf={pdf}
        pageNum={pageNum}
        scale={scale}
        isActive={isActive}
        onFocus={onFocus}
        updatePageHeightPt
      />
    </div>
  );
}
