import { useCallback, useEffect, useRef, useState } from "react";
import { useAnnotationKeyboard } from "../../hooks/useAnnotationKeyboard";
import { usePdfDocument } from "../../hooks/usePdfDocument";
import { usePdfPageNavigation } from "../../hooks/usePdfPageNavigation";
import {
  anchorPageAfterSpreadDelta,
  formatSpreadLabel,
  pagesInSpread,
  spreadCount,
  spreadIndexFromPage,
} from "../../lib/pdfSpread";
import { useProjectStore } from "../../stores/projectStore";
import {
  VIEWER_LAYOUT_LABELS,
  VIEWER_LAYOUT_MODES,
} from "../../types/viewerLayout";
import { PdfScrollView } from "./PdfScrollView";
import { PdfSingleView } from "./PdfSingleView";
import { PdfSpreadView } from "./PdfSpreadView";
import { ScriptToolbar } from "./ScriptToolbar";

type Props = {
  file: File | null;
};

export function PdfViewer({ file }: Props) {
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const viewerPage = useProjectStore((s) => s.viewerPage);
  const activePage = useProjectStore((s) => s.activePage);
  const pageCount = useProjectStore((s) => s.pdfPageCount);
  const layoutMode = useProjectStore((s) => s.viewerLayoutMode);
  const setViewerPage = useProjectStore((s) => s.setViewerPage);
  const setActivePage = useProjectStore((s) => s.setActivePage);
  const setViewerLayoutMode = useProjectStore((s) => s.setViewerLayoutMode);
  const setPdfPageCount = useProjectStore((s) => s.setPdfPageCount);
  const { pdf, error: loadError, loading } = usePdfDocument(file);
  const [scrollToPage, setScrollToPage] = useState<number | null>(null);

  useAnnotationKeyboard(activePage);

  const onScrollToPage = useCallback((page: number) => {
    setScrollToPage(page);
  }, []);

  const clearScrollRequest = useCallback(() => {
    setScrollToPage(null);
  }, []);

  const focusPage = useCallback(
    (page: number) => {
      setActivePage(page);
    },
    [setActivePage]
  );

  usePdfPageNavigation({
    mode: layoutMode,
    wrapRef: canvasWrapRef,
    pageNum: viewerPage,
    activePage,
    pageCount,
    setViewerPage,
    setActivePage,
    onScrollToPage,
    enabled: Boolean(file && pdf && pageCount > 0),
  });

  useEffect(() => {
    if (!file) {
      setPdfPageCount(0);
      setViewerPage(1);
      setActivePage(1);
      return;
    }
    setViewerPage(1);
    setActivePage(1);
  }, [file, setPdfPageCount, setViewerPage, setActivePage]);

  useEffect(() => {
    if (pdf) setPdfPageCount(pdf.numPages);
  }, [pdf, setPdfPageCount]);

  const goPrev = () => {
    if (pageCount <= 0) return;
    if (layoutMode === "spread") {
      const anchor = anchorPageAfterSpreadDelta(viewerPage, pageCount, -1);
      const pages = pagesInSpread(spreadIndexFromPage(anchor), pageCount);
      setViewerPage(anchor);
      setActivePage(pages.includes(activePage) ? activePage : pages[0]);
    } else if (layoutMode === "scroll") {
      const next = Math.max(1, activePage - 1);
      setActivePage(next);
      setViewerPage(next);
      onScrollToPage(next);
    } else {
      setViewerPage(viewerPage - 1);
    }
  };

  const goNext = () => {
    if (pageCount <= 0) return;
    if (layoutMode === "spread") {
      const anchor = anchorPageAfterSpreadDelta(viewerPage, pageCount, 1);
      const pages = pagesInSpread(spreadIndexFromPage(anchor), pageCount);
      setViewerPage(anchor);
      setActivePage(pages.includes(activePage) ? activePage : pages[0]);
    } else if (layoutMode === "scroll") {
      const next = Math.min(pageCount, activePage + 1);
      setActivePage(next);
      setViewerPage(next);
      onScrollToPage(next);
    } else {
      setViewerPage(viewerPage + 1);
    }
  };

  const prevDisabled =
    loading ||
    pageCount === 0 ||
    (layoutMode === "spread"
      ? spreadIndexFromPage(viewerPage) <= 0
      : layoutMode === "scroll"
        ? activePage <= 1
        : viewerPage <= 1);

  const nextDisabled =
    loading ||
    pageCount === 0 ||
    (layoutMode === "spread"
      ? spreadIndexFromPage(viewerPage) >= spreadCount(pageCount) - 1
      : layoutMode === "scroll"
        ? activePage >= pageCount
        : viewerPage >= pageCount);

  const statusLabel = (() => {
    if (pageCount <= 0) return "—";
    if (layoutMode === "spread") {
      const pages = pagesInSpread(spreadIndexFromPage(viewerPage), pageCount);
      return `${formatSpreadLabel(pages)} / ${pageCount}`;
    }
    if (layoutMode === "scroll") {
      return `Page ${activePage} / ${pageCount}`;
    }
    return `Page ${viewerPage} / ${pageCount}`;
  })();

  const navHint =
    layoutMode === "scroll"
      ? "Click a page to focus · PgUp/PgDn"
      : layoutMode === "spread"
        ? "Wheel · ← → · PgUp/PgDn (spread)"
        : "Wheel · ← → · PgUp/PgDn";

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
      {loadError && <p className="pdf-error">{loadError}</p>}
      <div className="pdf-controls">
        <div className="pdf-layout-toggle" role="group" aria-label="View layout">
          {VIEWER_LAYOUT_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              className={layoutMode === mode ? "active" : ""}
              title={VIEWER_LAYOUT_LABELS[mode]}
              onClick={() => setViewerLayoutMode(mode)}
            >
              {VIEWER_LAYOUT_LABELS[mode]}
            </button>
          ))}
        </div>
        <button type="button" disabled={prevDisabled} onClick={goPrev}>
          Prev
        </button>
        <span className="pdf-page-status">{statusLabel}</span>
        <button type="button" disabled={nextDisabled} onClick={goNext}>
          Next
        </button>
        <span className="pdf-nav-hint" title="Navigation shortcuts">
          {navHint}
        </span>
      </div>
      {pdf && layoutMode === "single" && (
        <PdfSingleView
          pdf={pdf}
          pageNum={viewerPage}
          isActive
          onFocus={() => focusPage(viewerPage)}
          wrapRef={canvasWrapRef}
        />
      )}
      {pdf && layoutMode === "scroll" && (
        <PdfScrollView
          pdf={pdf}
          pageCount={pageCount}
          activePage={activePage}
          scrollToPage={scrollToPage}
          onScrollToPageDone={clearScrollRequest}
          onFocusPage={focusPage}
          wrapRef={canvasWrapRef}
        />
      )}
      {pdf && layoutMode === "spread" && (
        <PdfSpreadView
          pdf={pdf}
          pageCount={pageCount}
          anchorPage={viewerPage}
          activePage={activePage}
          onFocusPage={focusPage}
          wrapRef={canvasWrapRef}
        />
      )}
    </div>
  );
}
