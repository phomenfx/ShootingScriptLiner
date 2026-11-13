/*
 * Find on script: the script's text with where each piece sits on its page,
 * and the matches for a search. Positions are fractions of the page (0–1,
 * top-left origin), so they work at any zoom.
 */

/** A run of characters in a line and where it sits across the page. */
export type TextSpan = { from: number; to: number; x0: number; x1: number };
export type TextLine = { text: string; spans: TextSpan[]; top: number; bottom: number };
export type PageText = { lines: TextLine[] };

export type FindMatch = { page: number; x: number; y: number; w: number; h: number };

/** Where a character offset in the line falls across the page, spread evenly within its span. */
function xAt(line: TextLine, offset: number): number {
  for (const span of line.spans) {
    if (offset >= span.from && offset <= span.to) {
      const t = span.to > span.from ? (offset - span.from) / (span.to - span.from) : 0;
      return span.x0 + (span.x1 - span.x0) * t;
    }
  }
  // In a gap between spans: the start of the next one, or the end of the last.
  const next = line.spans.find((span) => span.from > offset);
  return next ? next.x0 : (line.spans[line.spans.length - 1]?.x1 ?? 0);
}

/** Every place the text appears, ignoring case and runs of spaces, in reading order. */
export function findMatches(pages: PageText[], query: string): FindMatch[] {
  const needle = query.trim().replace(/\s+/g, " ").toLowerCase();
  if (!needle) return [];
  const matches: FindMatch[] = [];
  pages.forEach((page, index) => {
    for (const line of page.lines) {
      const hay = line.text.toLowerCase();
      let at = hay.indexOf(needle);
      while (at >= 0) {
        const x0 = xAt(line, at);
        const x1 = xAt(line, at + needle.length);
        matches.push({ page: index + 1, x: x0, y: line.top, w: Math.max(0.002, x1 - x0), h: line.bottom - line.top });
        at = hay.indexOf(needle, at + needle.length);
      }
    }
  });
  return matches;
}

type Piece = { str: string; x0: number; x1: number; top: number; bottom: number; baseline: number };

/** Joins pieces of text that share a baseline into lines, top to bottom, keeping where each piece sits. */
export function piecesToLines(pieces: Piece[], tolerance = 0.004): TextLine[] {
  const rows: { baseline: number; pieces: Piece[] }[] = [];
  for (const piece of pieces) {
    if (!piece.str.trim()) continue;
    const row = rows.find((r) => Math.abs(r.baseline - piece.baseline) <= tolerance);
    if (row) row.pieces.push(piece);
    else rows.push({ baseline: piece.baseline, pieces: [piece] });
  }
  rows.sort((a, b) => a.baseline - b.baseline);
  return rows.map((row) => {
    const sorted = row.pieces.sort((a, b) => a.x0 - b.x0);
    let text = "";
    let end = -Infinity;
    const spans: TextSpan[] = [];
    for (const piece of sorted) {
      // A visible gap between pieces becomes a space.
      if (text && piece.x0 - end > 0.001 && !text.endsWith(" ") && !piece.str.startsWith(" ")) text += " ";
      spans.push({ from: text.length, to: text.length + piece.str.length, x0: piece.x0, x1: piece.x1 });
      text += piece.str;
      end = piece.x1;
    }
    return {
      text,
      spans,
      top: Math.min(...sorted.map((p) => p.top)),
      bottom: Math.max(...sorted.map((p) => p.bottom)),
    };
  });
}
