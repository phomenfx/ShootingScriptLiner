import { describe, expect, it } from "vitest";
import { dragLinePoints, rejoinPoints, splitPoints } from "./lineDrag";

const line = [
  { x: 0, y: 0 },
  { x: 0, y: 10 },
  { x: 10, y: 10 },
];

describe("line points", () => {
  it("moves one vertex and leaves the others", () => {
    const next = dragLinePoints(line, { kind: "vertex", index: 1 }, { x: 4, y: 6 }, 0, false);
    expect(next[1]).toEqual({ x: 4, y: 6 });
    expect(next[0]).toEqual(line[0]);
    expect(next[2]).toEqual(line[2]);
  });

  it("slides a whole segment from its midpoint", () => {
    const next = dragLinePoints(line, { kind: "segment", index: 0 }, { x: 3, y: 5 }, 0, false);
    expect(next[0]).toEqual({ x: 3, y: 0 });
    expect(next[1]).toEqual({ x: 3, y: 10 });
    expect(next[2]).toEqual(line[2]);
  });

  it("snaps a middle vertex to the previous vertex or the next one", () => {
    const flatWithNext = dragLinePoints(line, { kind: "vertex", index: 1 }, { x: 4, y: 10.2 }, 15, false);
    expect(flatWithNext[1]).toEqual({ x: 4, y: 10 });
    const uprightWithPrevious = dragLinePoints(line, { kind: "vertex", index: 1 }, { x: 0.2, y: 4 }, 15, false);
    expect(uprightWithPrevious[1]).toEqual({ x: 0, y: 4 });
  });

  it("snaps an end vertex to the vertex it connects to", () => {
    const bent = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 6 },
    ];
    const next = dragLinePoints(bent, { kind: "vertex", index: 2 }, { x: 4.2, y: 2 }, 15, false);
    expect(next[2]).toEqual({ x: 4, y: 2 });
  });

  it("snaps a moved segment so the joint lines up with the vertex that stays", () => {
    const next = dragLinePoints(line, { kind: "segment", index: 0 }, { x: 3, y: 5.1 }, 15, false);
    expect(next[0]).toEqual({ x: 3, y: 0 });
    expect(next[1]).toEqual({ x: 3, y: 10 });
    expect(next[2]).toEqual(line[2]);
    const back = dragLinePoints(line, { kind: "segment", index: 1 }, { x: 5.1, y: 6 }, 15, false);
    expect(back[0]).toEqual(line[0]);
    expect(back[1]).toEqual({ x: 0, y: 6 });
    expect(back[2]).toEqual({ x: 10, y: 6 });
  });

  it("splits a segment at its midpoint and rejoins that vertex", () => {
    const split = splitPoints(
      [
        { x: 0, y: 0 },
        { x: 0, y: 10 },
      ],
      0
    );
    expect(split).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 5 },
      { x: 0, y: 10 },
    ]);
    expect(rejoinPoints(split!)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 10 },
    ]);
  });
});
