/** Book-spread layout. Page 1 sits alone unless `firstPageAlone` is false. */
export type SpreadOptions = {
  /** Page 1 sits by itself, like a title page. Default true. */
  firstPageAlone?: boolean;
};

function pageOneAlone(options?: SpreadOptions): boolean {
  return options?.firstPageAlone !== false;
}

/** Number of spreads for a script. */
export function spreadCount(pageCount: number, options?: SpreadOptions): number {
  if (pageCount <= 0) return 0;
  if (!pageOneAlone(options)) return Math.ceil(pageCount / 2);
  if (pageCount === 1) return 1;
  return 1 + Math.ceil((pageCount - 1) / 2);
}

/** 0-based spread index for a 1-based page number. */
export function spreadIndexFromPage(page: number, options?: SpreadOptions): number {
  if (page <= 1) return 0;
  if (!pageOneAlone(options)) return Math.floor((page - 1) / 2);
  return Math.floor((page - 2) / 2) + 1;
}

export type SpreadSlot = number | null;

/** Left and right page numbers for a spread; null = empty slot (same scale as paired pages). */
export function spreadSlots(
  spreadIndex: number,
  pageCount: number,
  options?: SpreadOptions
): [SpreadSlot, SpreadSlot] {
  if (pageCount <= 0 || spreadIndex < 0) return [null, null];
  if (!pageOneAlone(options)) {
    const left = spreadIndex * 2 + 1;
    if (left > pageCount) return [null, null];
    const right = left + 1 <= pageCount ? left + 1 : null;
    return [left, right];
  }
  if (spreadIndex <= 0) return [null, 1];
  const left = spreadIndex * 2;
  if (left > pageCount) return [null, null];
  const right = left + 1 <= pageCount ? left + 1 : null;
  return [left, right];
}

/** 1-based page numbers shown in a spread (0-based spread index). */
export function pagesInSpread(spreadIndex: number, pageCount: number, options?: SpreadOptions): number[] {
  return spreadSlots(spreadIndex, pageCount, options).filter((p): p is number => p != null);
}

/** Left (anchor) page for a spread index. With page 1 alone, spread 0's anchor is still page 1. */
export function anchorPageForSpread(spreadIndex: number, options?: SpreadOptions): number {
  if (!pageOneAlone(options)) return Math.max(0, spreadIndex) * 2 + 1;
  if (spreadIndex <= 0) return 1;
  return spreadIndex * 2;
}

/** Move spread by delta; returns new anchor page. */
export function anchorPageAfterSpreadDelta(
  anchorPage: number,
  pageCount: number,
  delta: number,
  options?: SpreadOptions
): number {
  const idx = spreadIndexFromPage(anchorPage, options);
  const nextIdx = Math.max(0, Math.min(spreadCount(pageCount, options) - 1, idx + delta));
  return anchorPageForSpread(nextIdx, options);
}

export function formatSpreadLabel(pages: number[]): string {
  if (pages.length === 0) return "—";
  if (pages.length === 1) return `Page ${pages[0]}`;
  return `Pages ${pages[0]}–${pages[1]}`;
}
