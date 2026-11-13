/*
 * Comparing an updated script with the one in use, page by page, so marks
 * can follow their page when pages are added or removed, and changed pages
 * can be pointed out.
 */

/** How alike two pages' text is: shared lines over all lines (0–1). */
export function pageSimilarity(a: string[], b: string[]): number {
  const norm = (lines: string[]) => lines.map((l) => l.replace(/\s+/g, " ").trim().toLowerCase()).filter(Boolean);
  const x = norm(a);
  const y = norm(b);
  if (x.length === 0 && y.length === 0) return 1;
  const counts = new Map<string, number>();
  for (const line of y) counts.set(line, (counts.get(line) ?? 0) + 1);
  let shared = 0;
  for (const line of x) {
    const n = counts.get(line) ?? 0;
    if (n > 0) {
      shared += 1;
      counts.set(line, n - 1);
    }
  }
  return (2 * shared) / (x.length + y.length);
}

export type ScriptComparison = {
  /** For each old page (index 0 = page 1), the new page its marks go to. */
  pageMap: number[];
  /** New pages whose text differs from the old page they match (or that are new). */
  changed: number[];
  /** New pages with no old page. */
  added: number[];
  /** Old pages with no new page. */
  removed: number[];
};

/** Pages count as the same page when this alike or more. */
const SAME_PAGE = 0.5;

/**
 * Lines up old and new pages in order (longest run of alike pages), then
 * gives every old page a new page: its match, or the page after the last
 * match before it.
 */
export function compareScripts(oldPages: string[][], newPages: string[][]): ScriptComparison {
  const n = oldPages.length;
  const m = newPages.length;
  const sim = oldPages.map((a) => newPages.map((b) => pageSimilarity(a, b)));
  // Best total similarity over matched pairs, in order.
  const best: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      const s = sim[i]![j]!;
      best[i]![j] = Math.max(best[i + 1]![j]!, best[i]![j + 1]!, s >= SAME_PAGE ? s + best[i + 1]![j + 1]! : 0);
    }
  }
  const match = new Array<number | undefined>(n).fill(undefined);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const s = sim[i]![j]!;
    if (s >= SAME_PAGE && best[i]![j] === s + best[i + 1]![j + 1]!) {
      match[i] = j;
      i += 1;
      j += 1;
    } else if (best[i + 1]![j]! >= best[i]![j + 1]!) i += 1;
    else j += 1;
  }

  const pageMap: number[] = [];
  let lastNew = -1;
  for (let k = 0; k < n; k += 1) {
    const hit = match[k];
    if (hit !== undefined) lastNew = hit;
    else lastNew = Math.min(m - 1, lastNew + 1);
    pageMap.push(Math.max(0, lastNew) + 1);
  }
  const matchedNew = new Set(match.filter((v): v is number => v !== undefined));
  const added = Array.from({ length: m }, (_, k) => k).filter((k) => !matchedNew.has(k)).map((k) => k + 1);
  const changed = [
    ...match.flatMap((hit, k) => (hit !== undefined && sim[k]![hit]! < 0.999 ? [hit + 1] : [])),
    ...added,
  ].sort((a, b) => a - b);
  const removed = match.flatMap((hit, k) => (hit === undefined ? [k + 1] : []));
  return { pageMap, changed, added, removed };
}
