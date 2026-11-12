import { describe, expect, it } from "vitest";
import { patternFields, patternKeys, segmentStrands } from "./strokeGeometry";

const a = { x: 0, y: 0 };
const b = { x: 100, y: 0 };

describe("segment strands", () => {
  it("draws a solid segment as one strand", () => {
    const [strand] = segmentStrands(a, b, "straight", 2);
    expect(strand?.points).toEqual([a, b]);
    expect(strand?.dash).toBeUndefined();
    expect(strand?.export).toBe(true);
  });

  it("keeps a segment pattern off its neighbors by taking one pattern at a time", () => {
    const plain = segmentStrands(a, b, "straight", 2);
    const dashed = segmentStrands(a, b, "dashes", 2);
    expect(plain[0]?.dash).toBeUndefined();
    expect(dashed[0]?.dash).toEqual([8, 8]);
  });

  it("follows the line pattern when the caller passes that pattern", () => {
    expect(segmentStrands(a, b, "dotted", 2)[0]?.dash).toEqual([2, 4]);
  });

  it("uses the line width when no segment width is passed", () => {
    expect(segmentStrands(a, b, "straight", 3)[0]?.widthPt).toBe(3);
    expect(segmentStrands(a, b, "straight", 5)[0]?.widthPt).toBe(5);
  });

  it("doubles the dash period at 200 percent and matches 100 when size is omitted", () => {
    expect(segmentStrands(a, b, "dashes", 2)[0]?.dash).toEqual(segmentStrands(a, b, "dashes", 2, { patternSizePct: 100 })[0]?.dash);
    expect(segmentStrands(a, b, "dashes", 2, { patternSizePct: 200 })[0]?.dash).toEqual([16, 16]);
  });

  it("lets a dash size replace the older pattern size without changing the gap", () => {
    expect(segmentStrands(a, b, "dashes", 2, { patternSizePct: 200, lengthPct: 100 })[0]?.dash).toEqual([8, 16]);
  });

  it("changes dash size and gap separately", () => {
    expect(segmentStrands(a, b, "dashes", 2, { lengthPct: 50 })[0]?.dash).toEqual([4, 8]);
    expect(segmentStrands(a, b, "dashes", 2, { gapPct: 200 })[0]?.dash).toEqual([8, 16]);
  });

  it("lists the older dash patterns and shows the fields each pattern uses", () => {
    expect(patternKeys("straight")).toContain("dashed_4_3_2_3");
    expect(patternFields("straight")).toEqual([]);
    expect(patternFields("dotted")).toEqual(["length", "gap"]);
    expect(patternFields("wavy")).toEqual(["length", "amplitude"]);
    expect(patternFields("straightWavy")).toEqual(["length", "amplitude", "side"]);
    expect(patternFields("triple")).toEqual(["gap"]);
  });

  it("builds a wave, a zigzag, and parallel strands", () => {
    expect(segmentStrands(a, b, "wavy", 2)[0]!.points.length).toBeGreaterThan(2);
    expect(segmentStrands(a, b, "zigzag", 2)[0]!.points.length).toBeGreaterThan(2);
    expect(segmentStrands(a, b, "double", 2)).toHaveLength(2);
    expect(segmentStrands(a, b, "triple", 2)).toHaveLength(3);
    expect(segmentStrands(a, b, "hashed", 2).length).toBeGreaterThan(1);
    expect(segmentStrands(a, b, "straightWavy", 2)).toHaveLength(2);
  });

  it("raises a wave with amplitude and shortens it with wavelength", () => {
    const peak = (pct: number) =>
      Math.max(...segmentStrands(a, b, "wavy", 2, { amplitudePct: pct })[0]!.points.map((point) => Math.abs(point.y)));
    expect(peak(200)).toBeGreaterThan(peak(100));
    const points = (pct: number) => segmentStrands(a, b, "wavy", 2, { lengthPct: pct })[0]!.points.length;
    expect(points(400)).toBeLessThan(points(100));
  });

  it("puts the wavy strand on the chosen side of a straight strand", () => {
    const y = (side: "left" | "right") => segmentStrands(a, b, "straightWavy", 2, { waveSide: side })[1]!.points[0]!.y;
    expect(y("right")).toBeGreaterThan(0);
    expect(y("left")).toBeLessThan(0);
  });

  it("keeps a hidden segment out of the export", () => {
    const [strand] = segmentStrands(a, b, "hidden", 2);
    expect(strand?.export).toBe(false);
    expect(strand?.opacity).toBeLessThan(1);
  });
});
