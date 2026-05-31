import { type RefObject, useEffect, useState } from "react";
import { computeMountedPageRange, type MountedPageRange } from "../lib/mountedPageRange";

export function useMountedPageRange(
  scrollRef: RefObject<HTMLElement | null>,
  pageCount: number,
  pageStridePx: number,
  maxMountedPages: number
): MountedPageRange {
  const [range, setRange] = useState<MountedPageRange>({
    start: 1,
    end: Math.max(1, Math.min(pageCount, maxMountedPages)),
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || pageCount <= 0 || pageStridePx <= 0) {
      setRange({
        start: 1,
        end: Math.max(1, Math.min(pageCount, maxMountedPages)),
      });
      return;
    }

    const update = () => {
      setRange(
        computeMountedPageRange(
          el.scrollTop,
          el.clientHeight,
          pageCount,
          pageStridePx,
          maxMountedPages
        )
      );
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [scrollRef, pageCount, pageStridePx, maxMountedPages]);

  return range;
}
