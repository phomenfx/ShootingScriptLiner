import type { PDFDocumentProxy } from "pdfjs-dist";
import { DEFAULT_VIEWER_SCALE } from "../../lib/pdfViewport";
import { PdfPageStack } from "./PdfPageStack";

type Props = {
  pdf: PDFDocumentProxy;
  pageNum: number;
  isActive: boolean;
  onFocus: () => void;
  wrapRef: React.RefObject<HTMLDivElement | null>;
};

export function PdfSingleView({ pdf, pageNum, isActive, onFocus, wrapRef }: Props) {
  return (
    <div className="pdf-canvas-wrap pdf-single-wrap" ref={wrapRef}>
      <PdfPageStack
        pdf={pdf}
        pageNum={pageNum}
        scale={DEFAULT_VIEWER_SCALE}
        isActive={isActive}
        onFocus={onFocus}
        updatePageHeightPt
      />
    </div>
  );
}
