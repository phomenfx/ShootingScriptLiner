import { useEffect, useRef, useState } from "react";
import { useAnnotationKeyboard } from "../../hooks/useAnnotationKeyboard";
import { usePdfDocument } from "../../hooks/usePdfDocument";
import { usePdfPageNavigation } from "../../hooks/usePdfPageNavigation";
import { useProjectStore } from "../../stores/projectStore";
import { AnnotationLayer } from "./AnnotationLayer";
import { ScriptToolbar } from "./ScriptToolbar";

const VIEWER_SCALE = 1.25;

type Props = {
  file: File | null;
};

export function PdfViewer({ file }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const pageNum = useProjectStore((s) => s.viewerPage);
  const pageCount = useProjectStore((s) => s.pdfPageCount);
  const setViewerPage = useProjectStore((s) => s.setViewerPage);
  const setPdfPageCount = useProjectStore((s) => s.setPdfPageCount);
  const setScriptPageHeightPt = useProjectStore((s) => s.setScriptPageHeightPt);
  const { pdf, error: loadError, loading } = usePdfDocument(file);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });

  const error = loadError ?? renderError;

  useAnnotationKeyboard(pageNum);

  usePdfPageNavigation({
    wrapRef: canvasWrapRef,
    pageNum,
    pageCount,
    setViewerPage,
    enabled: Boolean(file && pdf && pageCount > 0),
  });

  useEffect(() => {
    if (!file) {
      setPdfPageCount(0);
      setViewerPage(1);
      setPageSize({ width: 0, height: 0 });
      return;
    }
    setViewerPage(1);
  }, [file, setPdfPageCount, setViewerPage]);

  useEffect(() => {
    if (pdf) {
      setPdfPageCount(pdf.numPages);
    }
  }, [pdf, setPdfPageCount]);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;

    let cancelled = false;
    setRenderError(null);

    const render = async () => {
      try {
        const safePage = Math.min(pageNum, pdf.numPages);
        const page = await pdf.getPage(safePage);
        if (cancelled) return;

        const vp1 = page.getViewport({ scale: 1 });
        setScriptPageHeightPt(vp1.height);

        const viewport = page.getViewport({ scale: VIEWER_SCALE });
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;
        setPageSize({ width: viewport.width, height: viewport.height });
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
  }, [pdf, pageNum, setScriptPageHeightPt]);

  if (!file) {
    return (
      <div className="pdf-placeholder-inner">
        <p>Use Import PDF below to load a script.</p>
      </div>
    );
  }

  return (
    <div className="pdf-viewer">
      <ScriptToolbar />
      {error && <p className="pdf-error">{error}</p>}
      <div className="pdf-controls">
        <button
          type="button"
          disabled={pageNum <= 1 || loading}
          onClick={() => setViewerPage(pageNum - 1)}
        >
          Prev
        </button>
        <span>
          Page {pageNum} / {pageCount || "?"}
        </span>
        <button
          type="button"
          disabled={loading || pageCount === 0 || pageNum >= pageCount}
          onClick={() => setViewerPage(pageNum + 1)}
        >
          Next
        </button>
        <span className="pdf-nav-hint" title="Scroll wheel over the page preview">
          Mouse Wheel | Left/Right Arrows | Page Up/Page Down
        </span>
      </div>
      <div className="pdf-canvas-wrap" ref={canvasWrapRef}>
        <div
          className="pdf-page-stack"
          style={{ width: pageSize.width, height: pageSize.height }}
        >
          <canvas ref={canvasRef} />
          {pageSize.width > 0 && (
            <AnnotationLayer
              pageNum={pageNum}
              width={pageSize.width}
              height={pageSize.height}
            />
          )}
        </div>
      </div>
    </div>
  );
}
