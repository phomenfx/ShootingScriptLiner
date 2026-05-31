import type { PDFDocumentProxy } from "pdfjs-dist";
import { usePdfPageScale } from "../../hooks/usePdfPageScale";
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
  const { scale } = usePdfPageScale(wrapRef, pdf, zoomPercent);

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
