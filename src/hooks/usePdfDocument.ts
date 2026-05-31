import { useEffect, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

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
    let task: ReturnType<typeof pdfjs.getDocument> | null = null;

    setLoading(true);
    setError(null);
    setPdf(null);

    void (async () => {
      try {
        const data = await file.arrayBuffer();
        if (cancelled) return;
        task = pdfjs.getDocument({ data });
        const doc = await task.promise;
        if (cancelled) {
          void doc.destroy();
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
        if (prev) void prev.destroy();
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
