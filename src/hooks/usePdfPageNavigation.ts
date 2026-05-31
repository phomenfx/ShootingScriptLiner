import { type RefObject, useEffect, useRef } from "react";
import {
  anchorPageAfterSpreadDelta,
  pagesInSpread,
  spreadIndexFromPage,
} from "../lib/pdfSpread";
import type { ViewerLayoutMode } from "../types/viewerLayout";

const WHEEL_DEBOUNCE_MS = 150;
const WHEEL_DELTA_MIN = 10;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

type Options = {
  mode: ViewerLayoutMode;
  wrapRef: RefObject<HTMLElement | null>;
  pageNum: number;
  activePage: number;
  pageCount: number;
  setViewerPage: (page: number) => void;
  setActivePage: (page: number) => void;
  onScrollToPage: (page: number) => void;
  enabled: boolean;
};

export function usePdfPageNavigation({
  mode,
  wrapRef,
  pageNum,
  activePage,
  pageCount,
  setViewerPage,
  setActivePage,
  onScrollToPage,
  enabled,
}: Options) {
  const pageNumRef = useRef(pageNum);
  const activePageRef = useRef(activePage);
  pageNumRef.current = pageNum;
  activePageRef.current = activePage;

  useEffect(() => {
    if (!enabled || pageCount <= 0) return;

    const goPage = (delta: number) => {
      const base = mode === "scroll" ? activePageRef.current : pageNumRef.current;
      const next = Math.max(1, Math.min(pageCount, base + delta));
      if (mode === "scroll") {
        setActivePage(next);
        setViewerPage(next);
        onScrollToPage(next);
      } else if (mode === "spread") {
        const anchor = anchorPageAfterSpreadDelta(pageNumRef.current, pageCount, delta);
        const pages = pagesInSpread(spreadIndexFromPage(anchor), pageCount);
        setViewerPage(anchor);
        setActivePage(
          pages.includes(activePageRef.current) ? activePageRef.current : pages[0]
        );
      } else {
        setViewerPage(next);
      }
    };

    let lastWheelAt = 0;

    const onWheel = (e: WheelEvent) => {
      if (mode === "scroll") return;
      if (Math.abs(e.deltaY) < WHEEL_DELTA_MIN) return;
      e.preventDefault();
      const now = Date.now();
      if (now - lastWheelAt < WHEEL_DEBOUNCE_MS) return;
      lastWheelAt = now;
      if (mode === "spread") {
        const anchor = anchorPageAfterSpreadDelta(
          pageNumRef.current,
          pageCount,
          e.deltaY > 0 ? 1 : -1
        );
        setViewerPage(anchor);
        const pages = pagesInSpread(spreadIndexFromPage(anchor), pageCount);
        setActivePage(pages[0]);
      } else {
        goPage(e.deltaY > 0 ? 1 : -1);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === "PageDown" || e.key === "ArrowRight") {
        e.preventDefault();
        goPage(1);
      } else if (e.key === "PageUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        goPage(-1);
      }
    };

    const el = wrapRef.current;
    el?.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    return () => {
      el?.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    mode,
    wrapRef,
    pageCount,
    setViewerPage,
    setActivePage,
    onScrollToPage,
    enabled,
  ]);
}
