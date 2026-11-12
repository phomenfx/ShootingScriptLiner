import { describe, expect, it } from "vitest";
import { readProjectJson } from "../io/readProject";
import { serializeProject } from "../io/writeProject";
import { createProject } from "./defaults";
import { addMarks } from "./edits";
import { segmentLook, editStrokeTune, setSegmentPattern, setSegmentTune, setSegmentWidth } from "./segments";
import type { LineMark } from "./types";

function line(): LineMark {
  return {
    id: "line",
    kind: "line",
    page: 1,
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 40 },
      { x: 20, y: 40 },
    ],
    stroke: { pattern: "straight", widthPt: 2 },
    start: { type: "none", sizePct: 100, filled: true },
    end: { type: "none", sizePct: 100, filled: true },
    caption: { show: true, font: "Arial", sizePt: 11, bold: false, italic: false, underline: false, align: "left" },
    color: "#111111",
  };
}

describe("segment overrides", () => {
  it("lets the middle segment change pattern without touching the others", () => {
    const next = setSegmentPattern(line(), 0, "wavy");
    expect(segmentLook(next, 0).pattern).toBe("wavy");
    expect(segmentLook(next, 1).pattern).toBe("straight");
  });

  it("drops an override that matches the line", () => {
    const once = setSegmentPattern(line(), 1, "dotted");
    expect(setSegmentPattern(once, 1, "straight").segments).toBeUndefined();
  });

  it("stores a segment thickness even when it matches, and clears it on request", () => {
    const owned = setSegmentWidth(line(), 1, 2);
    expect(owned.segments?.[1]).toEqual({ widthPt: 2 });
    expect(segmentLook(owned, 0).widthPt).toBe(2);
    expect(setSegmentWidth(owned, 1, undefined).segments).toBeUndefined();
    const thicker = setSegmentWidth(line(), 1, 5);
    expect(segmentLook(thicker, 1).widthPt).toBe(5);
    expect(segmentLook(thicker, 0).widthPt).toBe(2);
  });

  it("keeps an older pattern size until a specific knob replaces it", () => {
    const base = line();
    base.stroke = { pattern: "dotted", widthPt: 2, patternSizePct: 150 };
    const next = editStrokeTune(base.stroke, "gap", 80);
    expect(next.patternSizePct).toBeUndefined();
    expect(next.lengthPct).toBe(150);
    expect(next.gapPct).toBe(80);
  });

  it("stores pattern size on one segment, including 100 when the line is larger", () => {
    const base = line();
    base.stroke.patternSizePct = 150;
    const next = setSegmentTune(base, 0, "patternSizePct", 100);
    expect(segmentLook(next, 0).patternSizePct).toBe(100);
    expect(segmentLook(next, 1).patternSizePct).toBe(150);
    expect(setSegmentTune(next, 0, "patternSizePct", 150).segments).toBeUndefined();
  });

  it("round-trips segment pattern, width, pattern size, and wave side", () => {
    const project = addMarks([
      {
        ...line(),
        stroke: { pattern: "straight", widthPt: 2, patternSizePct: 150 },
        segments: [null, { pattern: "straightWavy", widthPt: 4, lengthPct: 80, amplitudePct: 140, waveSide: "left" }],
      },
    ])(createProject());
    const opened = readProjectJson(serializeProject(project)).project;
    const saved = opened.marks.find((mark) => mark.id === "line");
    expect(saved?.kind === "line" && saved.stroke.patternSizePct).toBe(150);
    expect(saved?.kind === "line" && saved.segments).toEqual([
      null,
      { pattern: "straightWavy", widthPt: 4, lengthPct: 80, amplitudePct: 140, waveSide: "left" },
    ]);
  });
});
