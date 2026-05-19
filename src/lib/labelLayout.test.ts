import { describe, expect, it } from "vitest";
import { DEFAULT_LABEL_LAYOUT } from "../types/labelLayout";
import {
  normToPdf,
  primaryLabelPositionPdf,
  primaryLabelPositionPx,
  viewerScalePxPerPt,
} from "./labelLayout";

describe("labelLayout", () => {
  it("places primary PDF label above anchor when offset Y is positive", () => {
    const anchor = normToPdf(0.1, 0.2, 612, 792);
    const pos = primaryLabelPositionPdf({ x: 0.1, y: 0.2 }, 612, 792, DEFAULT_LABEL_LAYOUT);
    expect(pos.y).toBeGreaterThan(anchor.y);
    expect(pos.x).toBeGreaterThan(anchor.x);
  });

  it("scales pixel offsets with viewer scale", () => {
    const scale = viewerScalePxPerPt(792, 792);
    const pos = primaryLabelPositionPx({ x: 100, y: 200 }, DEFAULT_LABEL_LAYOUT, scale);
    expect(pos.x).toBe(100 + DEFAULT_LABEL_LAYOUT.labelOffsetXPt);
    expect(pos.y).toBe(200 - DEFAULT_LABEL_LAYOUT.labelOffsetYPt);
  });
});
