import { describe, expect, it } from "vitest";
import { noteMovePatch } from "./noteDrag";

describe("noteMovePatch", () => {
  it("moves the note by the pointer delta", () => {
    const frame = {
      left: 10,
      top: 20,
      width: 40,
      height: 16,
      baseline: 30,
      fontSize: 10,
      contentHeight: 12,
    };
    expect(noteMovePatch(frame, 5, -4, { w: 100, h: 200, scale: 1 })).toEqual({
      x: 0.15,
      y: (20 - 4 + 8) / 200,
    });
  });
});
