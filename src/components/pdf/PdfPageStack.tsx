import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
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

function isRenderCancelledError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  return (
    e.name === "RenderingCancelledException" ||
    /cancel/i.test(e.message) ||
    /same canvas during multiple render/i.test(e.message)
  );
}

export function PdfPageStack({
  pdf,
  pageNum,
  scale,
  isActive,
  onFocus,
  updatePageHeightPt = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const setScriptPageHeightPt = useProjectStore((s) => s.setScriptPageHeightPt);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    if (!updatePageHeightPt || !isActive) return;

    let cancelled = false;
    void pdf.getPage(pageNum).then((page) => {
      if (cancelled) return;
      setScriptPageHeightPt(page.getViewport({ scale: 1 }).height);
    });
    return () => {
      cancelled = true;
    };
  }, [pdf, pageNum, isActive, updatePageHeightPt, setScriptPageHeightPt]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    setRenderError(null);

    const cancelRenderTask = () => {
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
    };

    const render = async () => {
      try {
        cancelRenderTask();
        const page = await pdf.getPage(pageNum);
        if (cancelled) return;

        const viewport = page.getViewport({ scale });
        const ctx = canvas.getContext("2d");
        if (!ctx || cancelled) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;
        setSize({ width: viewport.width, height: viewport.height });

        const task = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;
        if (cancelled) return;
        renderTaskRef.current = null;
      } catch (e) {
        if (cancelled || isRenderCancelledError(e)) return;
        setRenderError(e instanceof Error ? e.message : "Failed to render page");
      }
    };

    void render();
    return () => {
      cancelled = true;
      cancelRenderTask();
    };
  }, [pdf, pageNum, scale]);

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
