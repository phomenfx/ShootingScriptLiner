import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useProjectStore } from "../../stores/projectStore";
import { AnnotationLayer } from "./AnnotationLayer";

type Props = {
  pdf: PDFDocumentProxy;
  pageNum: number;
  scale: number;
  isActive: boolean;
  onFocus: () => void;
  /** When this page is active, update global script page height (pt). */
  updatePageHeightPt?: boolean;
};

export function PdfPageStack({
  pdf,
  pageNum,
  scale,
  isActive,
  onFocus,
  updatePageHeightPt = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const setScriptPageHeightPt = useProjectStore((s) => s.setScriptPageHeightPt);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    setRenderError(null);

    const render = async () => {
      try {
        const page = await pdf.getPage(pageNum);
        if (cancelled) return;

        if (updatePageHeightPt && isActive) {
          const vp1 = page.getViewport({ scale: 1 });
          setScriptPageHeightPt(vp1.height);
        }

        const viewport = page.getViewport({ scale });
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;
        setSize({ width: viewport.width, height: viewport.height });
        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch (e) {
        if (!cancelled) {
          setRenderError(e instanceof Error ? e.message : "Failed to render page");
        }
      }
    };

    void render();
    return () => {
      cancelled = true;
    };
  }, [pdf, pageNum, scale, isActive, updatePageHeightPt, setScriptPageHeightPt]);

  return (
    <div
      className={`pdf-page-stack${isActive ? " pdf-page-stack--active" : ""}`}
      style={{ width: size.width || undefined, height: size.height || undefined }}
      onPointerDown={() => onFocus()}
      role="group"
      aria-label={`Page ${pageNum}`}
      aria-current={isActive ? "true" : undefined}
    >
      {renderError && <p className="pdf-error pdf-page-error">{renderError}</p>}
      <canvas ref={canvasRef} />
      {size.width > 0 && (
        <AnnotationLayer pageNum={pageNum} width={size.width} height={size.height} />
      )}
    </div>
  );
}
