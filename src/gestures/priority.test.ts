import { describe, expect, it } from "vitest";
import { pickSelectTarget, type LabelHit, type NoteHit } from "./priority";
import type { LineAnnotation, TextAnnotation } from "../types/annotations";
import { DEFAULT_LINE_ENDING, DEFAULT_LINE_LOCKS } from "../types/annotations";

const frame = { left: 10, top: 10, width: 40, height: 20, baseline: 20, fontSize: 12, contentHeight: 14 };

function line(id: string): LineAnnotation {
  return {
    id,
    kind: "line",
    page: 1,
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
    style: {
      stroke: "solid",
      widthPt: 1,
      color: "#111",
      start: DEFAULT_LINE_ENDING,
      end: DEFAULT_LINE_ENDING,
    },
    fontFamily: "Inter",
    fontSizePt: 10,
    labelBold: false,
    showLabel: true,
    locks: DEFAULT_LINE_LOCKS,
  };
}

function note(id: string): NoteHit {
  return { text: { id, kind: "text", page: 1, x: 0, y: 0, text: "Note", color: "#111" } as TextAnnotation, frame };
}

function label(id: string): LabelHit {
  return { which: "primary", line: line(id), frame, align: "left", anchor: { x: 0, y: 0 } };
}

const empty = {
  altKey: false,
  selectedLine: null,
  handles: null,
  selectedNote: null,
  selectedLabels: [] as LabelHit[],
  notesTopFirst: [] as NoteHit[],
  labelsTopFirst: [] as LabelHit[],
  hitId: null,
  lineForHitId: null,
  lineAtPoint: null,
};

describe("pickSelectTarget", () => {
  it("lets Alt-clone win over a handle", () => {
    const chosen = line("a");
    const target = pickSelectTarget({
      ...empty,
      altKey: true,
      px: { x: 0, y: 0 },
      selectedLine: chosen,
      handles: { vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }], mids: [{ x: 5, y: 0 }] },
      lineAtPoint: chosen,
    });
    expect(target.type).toBe("alt-clone");
  });

  it("prefers a note body over the line underneath", () => {
    const target = pickSelectTarget({
      ...empty,
      px: { x: 20, y: 16 },
      notesTopFirst: [note("n")],
      lineAtPoint: line("a"),
    });
    expect(target).toMatchObject({ type: "note-move", note: { id: "n" } });
  });

  it("clears when nothing is under the pointer", () => {
    expect(pickSelectTarget({ ...empty, px: { x: 0, y: 0 } }).type).toBe("clear");
  });
});
