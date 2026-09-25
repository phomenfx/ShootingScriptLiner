import { describe, expect, it } from "vitest";
import { DEFAULT_LABEL_LAYOUT } from "../types/labelLayout";
import type { Project } from "../types/project";
import {
  normToPdf,
  primaryLabelAnchor,
  primaryLabelPositionPdf,
  primaryLabelPositionPx,
  primaryLayoutForLine,
  secondaryLabelAnchor,
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

  it("keeps the label origin on the line start and the continuation origin on the continuation end", () => {
    const start = { x: 0, y: 0 };
    const end = { x: 100, y: 40 };
    expect(primaryLabelAnchor(start)).toEqual(start);
    expect(secondaryLabelAnchor(start, end, 1)).toEqual(end);
    expect(secondaryLabelAnchor(start, end, 0)).toEqual(start);
  });

  it("uses a per-line offset when set and the project offset otherwise", () => {
    const project = {
      labelOffsetXPt: 3,
      labelOffsetYPt: 4,
      labelSecondaryGapPt: 5,
    } as Project;
    expect(primaryLayoutForLine({}, project).labelOffsetXPt).toBe(3);
    expect(primaryLayoutForLine({ labelOffsetXPt: 10, labelOffsetYPt: 12 }, project)).toMatchObject({
      labelOffsetXPt: 10,
      labelOffsetYPt: 12,
    });
  });
});
