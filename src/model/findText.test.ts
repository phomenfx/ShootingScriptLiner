import { describe, expect, it } from "vitest";
import { findMatches, piecesToLines } from "./findText";

const piece = (str: string, x0: number, baseline: number) => ({ str, x0, x1: x0 + str.length * 0.01, top: baseline - 0.012, bottom: baseline + 0.003, baseline });

describe("find on script", () => {
  const lines = piecesToLines([piece("JOHN DOE", 0.4, 0.3), piece("INT. KITCHEN - DAY", 0.1, 0.1), piece("John waves.", 0.1, 0.32)]);

  it("joins pieces into lines, top to bottom", () => {
    expect(lines.map((l) => l.text)).toEqual(["INT. KITCHEN - DAY", "JOHN DOE", "John waves."]);
  });

  it("finds every match, ignoring case, with its place on the page", () => {
    const matches = findMatches([{ lines }, { lines }], "john");
    expect(matches).toHaveLength(4);
    expect(matches.map((m) => m.page)).toEqual([1, 1, 2, 2]);
    expect(matches[0]!.x).toBeCloseTo(0.4);
    expect(matches[0]!.w).toBeCloseTo(0.04);
    expect(findMatches([{ lines }], "  ")).toEqual([]);
  });
});
