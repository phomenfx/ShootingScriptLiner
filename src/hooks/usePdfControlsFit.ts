import { useLayoutEffect, useState } from "react";

/** One row with the shortcut hint, one row without it, or a wrapped row with the hint. */
export type PdfControlsFit = "full" | "compact" | "wrap";

function gapSize(el: HTMLElement): number {
  const value = Number.parseFloat(getComputedStyle(el).columnGap);
  return Number.isFinite(value) ? value : 0;
}

function elementWidth(el: HTMLElement): number {
  if (getComputedStyle(el).display !== "none") return el.offsetWidth;
  const previous = el.style.display;
  el.style.display = "inline-block";
  const width = el.offsetWidth;
  el.style.display = previous;
  return width;
}

/** Single-line width, even when the group is currently wrapped. */
function rowContentWidth(el: HTMLElement): number {
  const kids = [...el.children].filter((kid): kid is HTMLElement => kid instanceof HTMLElement);
  if (kids.length === 0) return elementWidth(el);
  const gap = gapSize(el);
  const widths = kids.map((kid) => elementWidth(kid));
  return widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, widths.length - 1);
}

/** Width of a single centered row so neither side runs into the page nav. */
function centeredRowWidth(left: number, center: number, right: number, gap: number): number {
  const side = Math.max(left, right);
  return side + gap + center + gap + side;
}

export function choosePdfControlsFit(
  available: number,
  fullWidth: number,
  compactWidth: number
): PdfControlsFit {
  if (available >= fullWidth) return "full";
  if (available >= compactWidth) return "compact";
  return "wrap";
}

/** Hide the nav hint before wrapping; show it again once the bar wraps. */
export function usePdfControlsFit(watch: string) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [fit, setFit] = useState<PdfControlsFit>("full");

  useLayoutEffect(() => {
    if (!root) return;

    const measure = () => {
      const layout = root.querySelector<HTMLElement>(".pdf-layout-toggle");
      const nav = root.querySelector<HTMLElement>(".pdf-controls-nav");
      const trail = root.querySelector<HTMLElement>(".pdf-controls-trail");
      const hint = root.querySelector<HTMLElement>(".pdf-nav-hint");
      const zoom = root.querySelector<HTMLElement>(".pdf-zoom-controls");
      if (!layout || !nav || !trail || !hint || !zoom) return;

      const styles = getComputedStyle(root);
      const available =
        root.clientWidth -
        Number.parseFloat(styles.paddingLeft) -
        Number.parseFloat(styles.paddingRight);
      const outerGap = gapSize(root);
      const trailGap = gapSize(trail);
      const layoutWidth = rowContentWidth(layout);
      const navWidth = rowContentWidth(nav);
      const zoomWidth = elementWidth(zoom);
      const hintWidth = elementWidth(hint);
      const slack = 4;

      const next = choosePdfControlsFit(
        available - slack,
        centeredRowWidth(layoutWidth, navWidth, hintWidth + trailGap + zoomWidth, outerGap),
        centeredRowWidth(layoutWidth, navWidth, zoomWidth, outerGap)
      );
      setFit((current) => (current === next ? current : next));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [root, watch]);

  return { fit, ref: setRoot };
}
