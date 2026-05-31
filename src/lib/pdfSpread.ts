/** Number of spreads for a script (page 1 alone, then pairs). */
export function spreadCount(pageCount: number): number {
  if (pageCount <= 0) return 0;
  if (pageCount === 1) return 1;
  return 1 + Math.ceil((pageCount - 1) / 2);
}

/** 0-based spread index for a 1-based page number. */
export function spreadIndexFromPage(page: number): number {
  if (page <= 1) return 0;
  return Math.floor((page - 2) / 2) + 1;
}

/** 1-based page numbers shown in a spread (0-based spread index). */
export function pagesInSpread(spreadIndex: number, pageCount: number): number[] {
  if (pageCount <= 0) return [];
  if (spreadIndex <= 0) return [1];
  const left = spreadIndex * 2;
  if (left > pageCount) return [pageCount];
  const pages = [left];
  if (left + 1 <= pageCount) pages.push(left + 1);
  return pages;
}

/** Left (anchor) page for a spread index. */
export function anchorPageForSpread(spreadIndex: number): number {
  if (spreadIndex <= 0) return 1;
  return spreadIndex * 2;
}

/** Move spread by delta; returns new anchor page. */
export function anchorPageAfterSpreadDelta(
  anchorPage: number,
  pageCount: number,
  delta: number
): number {
  const idx = spreadIndexFromPage(anchorPage);
  const nextIdx = Math.max(0, Math.min(spreadCount(pageCount) - 1, idx + delta));
  return anchorPageForSpread(nextIdx);
}

export function formatSpreadLabel(pages: number[]): string {
  if (pages.length === 0) return "—";
  if (pages.length === 1) return `Page ${pages[0]}`;
  return `Pages ${pages[0]}–${pages[1]}`;
}
