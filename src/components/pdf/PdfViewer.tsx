import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useAnnotationKeyboard } from "../../hooks/useAnnotationKeyboard";
import { useProjectStore } from "../../stores/projectStore";
import { AnnotationLayer } from "./AnnotationLayer";
import { ScriptToolbar } from "./ScriptToolbar";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

type Props = {
  file: File | null;
};

export function PdfViewer({ file }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageNum = useProjectStore((s) => s.viewerPage);
  const setViewerPage = useProjectStore((s) => s.setViewerPage);
  const setPdfPageCount = useProjectStore((s) => s.setPdfPageCount);
  const setScriptPageHeightPt = useProjectStore((s) => s.setScriptPageHeightPt);
  const [pageCount, setPageCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });

  useAnnotationKeyboard(pageNum);

  useEffect(() => {
    if (!file) {
      setPageCount(0);
      setPdfPageCount(0);
      setViewerPage(1);
      setPageSize({ width: 0, height: 0 });
      return;
    }
    setViewerPage(1);
  }, [file, setPdfPageCount, setViewerPage]);

  useEffect(() => {
    if (!file || !canvasRef.current) return;

    let cancelled = false;
    setError(null);

    const load = async () => {
      try {
        const data = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data }).promise;
        if (cancelled) return;
        setPageCount(pdf.numPages);
        setPdfPageCount(pdf.numPages);
        const safePage = Math.min(pageNum, pdf.numPages);
        const page = await pdf.getPage(safePage);
        if (cancelled) return;

        const vp1 = page.getViewport({ scale: 1 });
        setScriptPageHeightPt(vp1.height);

        const viewport = page.getViewport({ scale: 1.25 });
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;
        setPageSize({ width: viewport.width, height: viewport.height });
        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load PDF");
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [file, pageNum, setPdfPageCount, setScriptPageHeightPt]);

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
          disabled={pageNum <= 1}
          onClick={() => setViewerPage(pageNum - 1)}
        >
          Prev
        </button>
        <span>
          Page {pageNum} / {pageCount || "?"}
        </span>
        <button
          type="button"
          disabled={pageCount === 0 || pageNum >= pageCount}
          onClick={() => setViewerPage(pageNum + 1)}
        >
          Next
        </button>
      </div>
      <div className="pdf-canvas-wrap">
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
