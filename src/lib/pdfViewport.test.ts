import { describe, expect, it } from "vitest";
import { scaleToFitBox } from "./pdfViewport";

const letter = { w: 612, h: 792 };

describe("scaleToFitBox", () => {
  it("fits one page to a tall narrow pane by width", () => {
    const scale = scaleToFitBox(letter.w, letter.h, 400, 900, { pagesAcross: 1, padX: 32, padY: 32 });
    const byWidth = (400 - 32 - 2) / letter.w;
    const byHeight = (900 - 32 - 2) / letter.h;
    expect(byWidth).toBeLessThan(byHeight);
    expect(scale).toBeCloseTo(byWidth);
  });

  it("fits one page to a short wide pane by height", () => {
    const scale = scaleToFitBox(letter.w, letter.h, 1400, 700, { pagesAcross: 1, padX: 32, padY: 32 });
    const byWidth = (1400 - 32 - 2) / letter.w;
    const byHeight = (700 - 32 - 2) / letter.h;
    expect(byHeight).toBeLessThan(byWidth);
    expect(scale).toBeCloseTo(byHeight);
  });

  it("draws a spread smaller than a single page when width is the limit", () => {
    const fit = { padX: 32, padY: 32 };
    const one = scaleToFitBox(letter.w, letter.h, 1000, 900, { ...fit, pagesAcross: 1 });
    const two = scaleToFitBox(letter.w, letter.h, 1000, 900, { ...fit, pagesAcross: 2, gapPx: 12 });
    expect(two).toBeLessThan(one);
  });
});
