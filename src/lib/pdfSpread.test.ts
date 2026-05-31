import { describe, expect, it } from "vitest";
import {
  anchorPageAfterSpreadDelta,
  anchorPageForSpread,
  formatSpreadLabel,
  pagesInSpread,
  spreadCount,
  spreadIndexFromPage,
  spreadSlots,
} from "./pdfSpread";

describe("pdfSpread", () => {
  it("counts spreads", () => {
    expect(spreadCount(0)).toBe(0);
    expect(spreadCount(1)).toBe(1);
    expect(spreadCount(2)).toBe(2);
    expect(spreadCount(3)).toBe(2);
    expect(spreadCount(4)).toBe(3);
  });

  it("lists pages per spread", () => {
    expect(pagesInSpread(0, 4)).toEqual([1]);
    expect(pagesInSpread(1, 4)).toEqual([2, 3]);
    expect(pagesInSpread(2, 4)).toEqual([4]);
  });

  it("assigns left/right spread slots", () => {
    expect(spreadSlots(0, 4)).toEqual([null, 1]);
    expect(spreadSlots(1, 4)).toEqual([2, 3]);
    expect(spreadSlots(2, 4)).toEqual([4, null]);
  });

  it("maps page to spread index", () => {
    expect(spreadIndexFromPage(1)).toBe(0);
    expect(spreadIndexFromPage(2)).toBe(1);
    expect(spreadIndexFromPage(3)).toBe(1);
    expect(spreadIndexFromPage(4)).toBe(2);
  });

  it("advances spread anchor", () => {
    expect(anchorPageAfterSpreadDelta(1, 4, 1)).toBe(2);
    expect(anchorPageAfterSpreadDelta(2, 4, 1)).toBe(4);
    expect(anchorPageAfterSpreadDelta(4, 4, -1)).toBe(2);
  });

  it("formats spread label", () => {
    expect(formatSpreadLabel([1])).toBe("Page 1");
    expect(formatSpreadLabel([2, 3])).toBe("Pages 2–3");
  });

  it("anchor page for spread index", () => {
    expect(anchorPageForSpread(0)).toBe(1);
    expect(anchorPageForSpread(1)).toBe(2);
    expect(anchorPageForSpread(2)).toBe(4);
  });
});
