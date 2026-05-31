import { type RefObject, useEffect, useRef } from "react";

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
  wrapRef: RefObject<HTMLElement | null>;
  pageNum: number;
  pageCount: number;
  setViewerPage: (page: number) => void;
  enabled: boolean;
};

/** Wheel on wrap + PageUp/Down and arrow keys for prev/next page (single-page mode). */
export function usePdfPageNavigation({
  wrapRef,
  pageNum,
  pageCount,
  setViewerPage,
  enabled,
}: Options) {
  const pageNumRef = useRef(pageNum);
  pageNumRef.current = pageNum;

  useEffect(() => {
    if (!enabled || pageCount <= 0) return;

    const go = (delta: number) => {
      setViewerPage(pageNumRef.current + delta);
    };

    let lastWheelAt = 0;

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < WHEEL_DELTA_MIN) return;
      e.preventDefault();
      const now = Date.now();
      if (now - lastWheelAt < WHEEL_DEBOUNCE_MS) return;
      lastWheelAt = now;
      go(e.deltaY > 0 ? 1 : -1);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === "PageDown" || e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      } else if (e.key === "PageUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      }
    };

    const el = wrapRef.current;
    el?.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    return () => {
      el?.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [wrapRef, pageCount, setViewerPage, enabled]);
}
