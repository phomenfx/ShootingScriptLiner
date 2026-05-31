const BUFFER_PAGES = 2;

export type MountedPageRange = { start: number; end: number };

/**
 * Compute which 1-based page indices to mount in scroll view.
 * Visible pages are always included when possible; buffer fills remaining budget.
 */
export function computeMountedPageRange(
  scrollTop: number,
  clientHeight: number,
  pageCount: number,
  pageStridePx: number,
  maxMountedPages: number,
  bufferPages = BUFFER_PAGES
): MountedPageRange {
  if (pageCount <= 0 || pageStridePx <= 0 || maxMountedPages <= 0) {
    return { start: 1, end: Math.max(0, pageCount) };
  }

  const visibleFirst = Math.max(1, Math.floor(scrollTop / pageStridePx) + 1);
  const visibleLast = Math.min(
    pageCount,
    Math.max(visibleFirst, Math.ceil((scrollTop + clientHeight) / pageStridePx))
  );

  let first = Math.max(1, visibleFirst - bufferPages);
  let last = Math.min(pageCount, visibleLast + bufferPages);

  const span = () => last - first + 1;

  if (span() > maxMountedPages) {
    const visibleSpan = visibleLast - visibleFirst + 1;

    if (visibleSpan >= maxMountedPages) {
      first = visibleFirst;
      last = Math.min(pageCount, visibleFirst + maxMountedPages - 1);
    } else {
      first = visibleFirst;
      last = visibleLast;
      let remaining = maxMountedPages - span();

      const addBefore = Math.min(remaining, visibleFirst - 1, bufferPages);
      first -= addBefore;
      remaining -= addBefore;

      const addAfter = Math.min(remaining, pageCount - last, bufferPages);
      last += addAfter;
      remaining -= addAfter;

      while (remaining > 0 && first > 1) {
        first--;
        remaining--;
      }
      while (remaining > 0 && last < pageCount) {
        last++;
        remaining--;
      }
    }
  }

  return { start: first, end: last };
}
