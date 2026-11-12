/**
 * Which gesture a select-tool click starts. Earlier checks win.
 * Order: Alt-clone, selected handles, selected label origin, selected label
 * handles, note body, label body, a hit mark, the line under the pointer, clear.
 */
import { alignmentPoint, hitBoxHandle, pointInFrame, type BoxHandle, type TextFrame } from "../lib/textBox";
import type { LineAnnotation, TextAlign, TextAnnotation } from "../types/annotations";
import { type LineHandle } from "./lineDrag";

export type LabelHit = {
  which: "primary" | "secondary";
  line: LineAnnotation;
  frame: TextFrame;
  align: TextAlign;
  anchor: { x: number; y: number };
};

export type NoteHit = {
  text: TextAnnotation;
  frame: TextFrame;
};

export type SelectTarget =
  | { type: "alt-clone"; line: LineAnnotation }
  | { type: "handle"; line: LineAnnotation; handle: LineHandle }
  | { type: "note-resize"; note: TextAnnotation; handle: BoxHandle; frame: TextFrame }
  | { type: "label-move"; label: LabelHit }
  | { type: "label-resize"; label: LabelHit; handle: BoxHandle }
  | { type: "note-move"; note: TextAnnotation; frame: TextFrame }
  | { type: "select-line"; line: LineAnnotation }
  | { type: "select-id"; id: string }
  | { type: "clear" };

function hitHandle(px: number, py: number, hx: number, hy: number, radius = 10): boolean {
  return (px - hx) ** 2 + (py - hy) ** 2 <= radius * radius;
}

function hitOrigin(px: number, py: number, frame: TextFrame, align: TextAlign): boolean {
  const point = alignmentPoint(frame, align, true);
  return (px - point.x) ** 2 + (py - point.y) ** 2 <= 64;
}

export function pickSelectTarget(input: {
  altKey: boolean;
  px: { x: number; y: number };
  selectedLine: LineAnnotation | null;
  /** Vertex handles, then one midpoint handle per segment. */
  handles: { vertices: { x: number; y: number }[]; mids: { x: number; y: number }[] } | null;
  selectedNote: NoteHit | null;
  selectedLabels: LabelHit[];
  notesTopFirst: NoteHit[];
  labelsTopFirst: LabelHit[];
  hitId: string | null;
  lineForHitId: LineAnnotation | null;
  lineAtPoint: LineAnnotation | null;
}): SelectTarget {
  const { px } = input;
  if (input.altKey && input.lineAtPoint) return { type: "alt-clone", line: input.lineAtPoint };

  const handles = input.handles;
  if (input.selectedLine && handles) {
    for (let index = 0; index < handles.vertices.length; index += 1) {
      const vertex = handles.vertices[index]!;
      if (hitHandle(px.x, px.y, vertex.x, vertex.y)) {
        return { type: "handle", line: input.selectedLine, handle: { kind: "vertex", index } };
      }
    }
    for (let index = 0; index < handles.mids.length; index += 1) {
      const mid = handles.mids[index]!;
      if (hitHandle(px.x, px.y, mid.x, mid.y, 6)) {
        return { type: "handle", line: input.selectedLine, handle: { kind: "segment", index } };
      }
    }
  }

  if (input.selectedNote) {
    const handle = hitBoxHandle(px.x, px.y, input.selectedNote.frame);
    if (handle) return { type: "note-resize", note: input.selectedNote.text, handle, frame: input.selectedNote.frame };
  }

  for (const label of input.selectedLabels) {
    if (hitOrigin(px.x, px.y, label.frame, label.align)) return { type: "label-move", label };
    const handle = hitBoxHandle(px.x, px.y, label.frame);
    if (handle) return { type: "label-resize", label, handle };
  }

  for (const note of input.notesTopFirst) {
    if (pointInFrame(px.x, px.y, note.frame)) return { type: "note-move", note: note.text, frame: note.frame };
  }

  for (const label of input.labelsTopFirst) {
    if (pointInFrame(px.x, px.y, label.frame)) return { type: "label-move", label };
  }

  if (input.hitId) {
    return input.lineForHitId
      ? { type: "select-line", line: input.lineForHitId }
      : { type: "select-id", id: input.hitId };
  }

  if (input.lineAtPoint) return { type: "select-line", line: input.lineAtPoint };
  return { type: "clear" };
}
