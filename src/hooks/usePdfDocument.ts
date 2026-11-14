import { useEffect, useState } from "react";
import type { PDFDocumentProxy, PDFDocumentLoadingTask } from "pdfjs-dist";

/** The PDF reader, loaded the first time a script is shown (it is large, so the app starts faster without it). */
let reader: Promise<typeof import("pdfjs-dist")> | null = null;
function loadReader() {
  reader ??= Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  });
  return reader;
}

export function usePdfDocument(file: File | null) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!file) {
      setPdf(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;

    setLoading(true);
    setError(null);
    setPdf(null);

    void (async () => {
      try {
        const [data, pdfjs] = await Promise.all([file.arrayBuffer(), loadReader()]);
        if (cancelled) return;
        task = pdfjs.getDocument({ data });
        const doc = await task.promise;
        if (cancelled) {
          void doc.loadingTask.destroy();
          return;
        }
        setPdf(doc);
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load PDF");
          setPdf(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      void task?.destroy();
      setPdf((prev) => {
        if (prev) void prev.loadingTask.destroy();
        return null;
      });
    };
  }, [file]);

  return {
    pdf,
    error,
    loading,
    numPages: pdf?.numPages ?? 0,
  };
}
