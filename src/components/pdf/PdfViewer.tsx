import { FindBar } from "./FindBar";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import * as commands from "../../commands";
import { useAnnotationKeyboard } from "../../hooks/useAnnotationKeyboard";
import { usePdfDocument } from "../../hooks/usePdfDocument";
import { usePdfPageNavigation } from "../../hooks/usePdfPageNavigation";
import { usePdfZoomWheel } from "../../hooks/usePdfZoomWheel";
import {
  anchorPageAfterSpreadDelta,
  anchorPageForSpread,
  pagesInSpread,
  spreadCount,
  spreadIndexFromPage,
} from "../../lib/pdfSpread";
import { useProjectStore } from "../../stores/projectStore";
import { usePrefsStore } from "../../stores/prefsStore";
import { useSessionStore } from "../../stores/sessionStore";
import { VIEWER_LAYOUT_LABELS, VIEWER_LAYOUT_MODES, VIEWER_LAYOUT_SHORT } from "../../types/viewerLayout";
import { Menu, type MenuEntry } from "../topbar/Menu";
import { PdfScrollView } from "./PdfScrollView";
import { PdfSingleView } from "./PdfSingleView";
import { PdfSpreadView } from "./PdfSpreadView";
import { PdfZoomControls } from "./PdfZoomControls";
import { ScriptToolbar } from "./ScriptToolbar";

type Props = {
  file: File | null;
};

export function PdfViewer({ file }: Props) {
  const [dropping, setDropping] = useState(false);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const viewerPage = useSessionStore((s) => s.viewerPage);
  const activePage = useSessionStore((s) => s.activePage);
  const pageCount = useSessionStore((s) => s.pdfPageCount);
  const setViewerPage = useSessionStore((s) => s.setViewerPage);
  const setActivePage = useSessionStore((s) => s.setActivePage);
  const setPdfPageCount = useSessionStore((s) => s.setPdfPageCount);
  const layoutMode = usePrefsStore((s) => s.viewerLayoutMode);
  const viewerZoomPercent = usePrefsStore((s) => s.viewerZoomPercent);
  const firstPageAlone = useProjectStore((s) => s.project.settings.drawing.firstPageAlone);
  const { pdf, error: loadError, loading } = usePdfDocument(file);
  const [scrollToPage, setScrollToPage] = useState<number | null>(null);
  const [pageDraft, setPageDraft] = useState("");
  const [pageEditing, setPageEditing] = useState(false);

  useAnnotationKeyboard(activePage);

  const spread = { firstPageAlone };
  const shownPage = layoutMode === "scroll" || layoutMode === "spread" ? activePage : viewerPage;

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
    firstPageAlone,
  });

  usePdfZoomWheel(canvasWrapRef, Boolean(file && pdf && pageCount > 0));

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

  const goToPage = (page: number) => {
    if (pageCount <= 0) return;
    const next = Math.max(1, Math.min(pageCount, page));
    if (layoutMode === "spread") {
      const index = spreadIndexFromPage(next, spread);
      setViewerPage(anchorPageForSpread(index, spread));
      setActivePage(next);
    } else if (layoutMode === "scroll") {
      setActivePage(next);
      setViewerPage(next);
      onScrollToPage(next);
    } else {
      setViewerPage(next);
    }
  };

  const goPrev = () => {
    if (pageCount <= 0) return;
    if (layoutMode === "spread") {
      const anchor = anchorPageAfterSpreadDelta(viewerPage, pageCount, -1, spread);
      const pages = pagesInSpread(spreadIndexFromPage(anchor, spread), pageCount, spread);
      setViewerPage(anchor);
      setActivePage(pages.includes(activePage) ? activePage : pages[0]!);
    } else {
      goToPage((layoutMode === "scroll" ? activePage : viewerPage) - 1);
    }
  };

  const goNext = () => {
    if (pageCount <= 0) return;
    if (layoutMode === "spread") {
      const anchor = anchorPageAfterSpreadDelta(viewerPage, pageCount, 1, spread);
      const pages = pagesInSpread(spreadIndexFromPage(anchor, spread), pageCount, spread);
      setViewerPage(anchor);
      setActivePage(pages.includes(activePage) ? activePage : pages[0]!);
    } else {
      goToPage((layoutMode === "scroll" ? activePage : viewerPage) + 1);
    }
  };

  const prevDisabled =
    loading ||
    pageCount === 0 ||
    (layoutMode === "spread"
      ? spreadIndexFromPage(viewerPage, spread) <= 0
      : shownPage <= 1);

  const nextDisabled =
    loading ||
    pageCount === 0 ||
    (layoutMode === "spread"
      ? spreadIndexFromPage(viewerPage, spread) >= spreadCount(pageCount, spread) - 1
      : shownPage >= pageCount);

  const viewEntries: MenuEntry[] = VIEWER_LAYOUT_MODES.map((mode) => ({
    kind: "radio" as const,
    label: VIEWER_LAYOUT_LABELS[mode],
    checked: layoutMode === mode,
    onSelect: () => commands.setViewMode(mode),
  }));

  const commitPageDraft = () => {
    const n = Number.parseInt(pageDraft, 10);
    if (Number.isFinite(n)) goToPage(n);
    setPageEditing(false);
  };

  return (
    <div className="pdf-viewer">
      <ScriptToolbar />
      <FindBar />
      {loadError && <p className="pdf-error">{loadError}</p>}
      {!file && (
        <div
          className={`pdf-placeholder-inner${dropping ? " is-dropping" : ""}`}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            setDropping(true);
          }}
          onDragLeave={() => setDropping(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDropping(false);
            const dropped = e.dataTransfer.files[0];
            if (!dropped) return;
            const name = dropped.name.toLowerCase();
            if (name.endsWith(".pdf")) void commands.importPdf(dropped);
            else if (name.endsWith(".zip") || name.endsWith(".json")) void commands.openProject(dropped);
          }}
        >
          <p className="pdf-placeholder-title">No script loaded</p>
          <p>Drop a script PDF or a saved project here, or:</p>
          <div className="pdf-placeholder-actions">
            <button type="button" onClick={() => void commands.requestImportPdf()}>
              Import script
            </button>
            <button type="button" onClick={() => void commands.requestOpenProject()}>
              Open project
            </button>
          </div>
        </div>
      )}
      {pdf && layoutMode === "single" && (
        <PdfSingleView
          pdf={pdf}
          pageNum={viewerPage}
          zoomPercent={viewerZoomPercent}
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
          zoomPercent={viewerZoomPercent}
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
          zoomPercent={viewerZoomPercent}
          onFocusPage={focusPage}
          wrapRef={canvasWrapRef}
          spread={spread}
        />
      )}
      <div className="script-bottombar">
        <Menu
          triggerClassName="script-view-picker"
          triggerLabel="View"
          trigger={
            <>
              <span>{VIEWER_LAYOUT_SHORT[layoutMode]}</span>
              <ChevronDown size={12} strokeWidth={1.75} />
            </>
          }
          entries={viewEntries}
        />
        <span className="script-spacer" />
        <button type="button" className="script-iconbtn" title="Previous page" disabled={prevDisabled} onClick={goPrev}>
          <ChevronLeft size={15} strokeWidth={1.75} />
        </button>
        <label className="script-field script-page-field">
          <input
            type="text"
            inputMode="numeric"
            aria-label="Page"
            disabled={pageCount <= 0}
            value={pageEditing ? pageDraft : pageCount > 0 ? String(shownPage) : "—"}
            onFocus={() => {
              setPageDraft(pageCount > 0 ? String(shownPage) : "");
              setPageEditing(true);
            }}
            onChange={(e) => setPageDraft(e.target.value)}
            onBlur={commitPageDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitPageDraft();
                (e.target as HTMLInputElement).blur();
              } else if (e.key === "Escape") {
                setPageEditing(false);
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
          <span>/ {pageCount > 0 ? pageCount : "—"}</span>
        </label>
        <button type="button" className="script-iconbtn" title="Next page" disabled={nextDisabled} onClick={goNext}>
          <ChevronRight size={15} strokeWidth={1.75} />
        </button>
        <span className="script-sep" />
        <PdfZoomControls />
      </div>
    </div>
  );
}
