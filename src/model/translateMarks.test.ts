import { describe, expect, it } from "vitest";
import { createProject } from "./defaults";
import { translateMarks } from "./edits";
import type { Mark } from "./types";

describe("moving several marks", () => {
  it("moves lines, notes and shapes by the same distance and leaves others alone", () => {
    const project = createProject();
    const line = { id: "l", kind: "line", page: 1, points: [{ x: 10, y: 10 }, { x: 10, y: 50 }] } as unknown as Mark;
    const note = { id: "n", kind: "text", page: 1, x: 100, y: 100 } as unknown as Mark;
    const shape = { id: "s", kind: "shape", page: 1, shape: "rectangle", x: 0, y: 0, widthPt: 5, heightPt: 5, rotation: 0 } as Mark;
    const other = { id: "o", kind: "text", page: 1, x: 1, y: 1 } as unknown as Mark;
    project.marks = [line, note, shape, other];
    const moved = translateMarks([line, note, shape], 5, -3)(project).marks;
    expect(moved[0]).toMatchObject({ points: [{ x: 15, y: 7 }, { x: 15, y: 47 }] });
    expect(moved[1]).toMatchObject({ x: 105, y: 97 });
    expect(moved[2]).toMatchObject({ x: 5, y: -3 });
    expect(moved[3]).toBe(other);
  });
});
