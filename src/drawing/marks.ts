/**
 * Mark changes made from the script page. The page still describes a line in
 * the old shape while dragging; this writes that change into the version 2 model.
 */
import { longestSegmentIndex, rejoinIndex, rejoinPoints, splitPoints } from "../gestures/lineDrag";
import { getLineDisplayLabel } from "../lib/annotationUtils";
import { computeMarginContinuationTrim, type MarginTrimHint } from "../lib/lineMarginContinuation";
import { FALLBACK_PAGE } from "../io/migrateV1";
import { legacyLine, legacyText, lineToV2, textToV2, toLegacyProject } from "../legacy/legacyView";
import * as edits from "../model/edits";
import { applyIntoLastStep, breakUndoGroup, useProjectStore } from "../stores/projectStore";
import { useSessionStore } from "../stores/sessionStore";
import type { LineAnnotation, NormalizedPoint, TextAnnotation } from "../types/annotations";

const v2 = () => useProjectStore.getState().project;
const session = () => useSessionStore.getState();

function applyStep(edit: edits.Edit): void {
  breakUndoGroup();
  useProjectStore.getState().apply(edit);
}

/** Lines whose old "shot type" field is unlocked. The version 2 model has no such lock. */
let shotTypeUnlocked: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

export function shotTypeUnlocks(): ReadonlySet<string> {
  return shotTypeUnlocked;
}

export function subscribeShotTypeUnlock(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(): void {
  listeners.forEach((listener) => listener());
}

/** `locked` is the old field lock: true follows the shot. */
export function noteShotTypeLock(id: string, locked: boolean): void {
  const next = new Set(shotTypeUnlocked);
  if (locked) next.delete(id);
  else next.add(id);
  shotTypeUnlocked = next;
  emit();
}

function lineMark(id: string) {
  const mark = edits.findMark(v2(), id);
  return mark?.kind === "line" ? mark : null;
}

function pageOf(page: number) {
  const pages = v2().script?.pages ?? [];
  return pages[page - 1] ?? pages[0] ?? FALLBACK_PAGE;
}

/** Insert a vertex on one segment. Without a point, it lands at that segment's midpoint. */
export function splitLine(id: string, segmentIndex?: number, atNormalized?: { x: number; y: number }): void {
  const base = lineMark(id);
  if (!base) return;
  const index = segmentIndex ?? longestSegmentIndex(base.points);
  const size = pageOf(base.page);
  const at = atNormalized ? { x: atNormalized.x * size.widthPt, y: atNormalized.y * size.heightPt } : undefined;
  const points = splitPoints(base.points, index, at);
  if (!points) return;
  const segments = base.segments ? [...base.segments] : undefined;
  if (segments) {
    const kept = segments[index] ?? null;
    segments.splice(index, 1, kept, kept);
  }
  applyStep(edits.replaceMark(segments ? { ...base, points, segments } : { ...base, points }));
}

/** Remove the middle vertex, or the one named, so two segments become one. */
export function rejoinLine(id: string, vertexIndex?: number): void {
  const base = lineMark(id);
  if (!base) return;
  const index = rejoinIndex(base.points, vertexIndex);
  const points = rejoinPoints(base.points, vertexIndex);
  if (index === null || !points) return;
  const segments = base.segments ? [...base.segments] : undefined;
  if (segments) segments.splice(index, 1);
  applyStep(edits.replaceMark(segments ? { ...base, points, segments } : { ...base, points }));
}

/** Merge an old-shape patch into a line and store the version 2 result. */
export function replaceLine(id: string, patch: Partial<LineAnnotation>): void {
  const base = lineMark(id);
  if (!base) return;
  const shown = legacyLine(base, v2(), shotTypeUnlocked.has(id));
  useProjectStore.getState().apply(edits.replaceMark(lineToV2({ ...shown, ...patch } as typeof shown, v2(), base)));
}

/** Adds a line in the same undo step as the edit just before it (the new shot of a Ctrl+drag). */
export function addLineJoined(line: LineAnnotation): void {
  useProjectStore.getState().apply(edits.addMarks([lineToV2(line, v2())]));
  breakUndoGroup();
  session().select("mark", line.id);
}

export function addLine(line: LineAnnotation): void {
  applyStep(edits.addMarks([lineToV2(line, v2())]));
  session().select("mark", line.id);
}

export function addText(text: TextAnnotation): void {
  applyStep(edits.addMarks([textToV2(text, v2())]));
  session().select("mark", text.id);
}

export function updateText(id: string, patch: Partial<TextAnnotation>): void {
  const base = edits.findMark(v2(), id);
  if (base?.kind !== "text") return;
  const shown = legacyText(base, v2());
  useProjectStore.getState().apply(edits.replaceMark(textToV2({ ...shown, ...patch }, v2(), base)));
}

export function applyMarginContinuationTrim(
  lineId: string,
  pageHeightPt: number,
  hint: MarginTrimHint = "drawEnd"
): void {
  const base = lineMark(lineId);
  if (!base) return;
  const shown = legacyLine(base, v2());
  const trimmed = trimPolyline(shown.points, pageHeightPt, hint);
  const same =
    !trimmed.marginContinuation &&
    !shown.marginContinuation &&
    trimmed.points.length === shown.points.length &&
    trimmed.points.every((p, i) => p.x === shown.points[i]!.x && p.y === shown.points[i]!.y);
  if (same) return;
  // The trim belongs to the gesture that drew or moved the line, so it shares its undo step.
  const full = legacyLine(base, v2(), shotTypeUnlocked.has(lineId));
  applyIntoLastStep(edits.replaceMark(lineToV2({ ...full, ...trimmed } as typeof full, v2(), base)));
}

/** Clip only the first and last segments. Interior vertices stay where they are. */
function trimPolyline(points: NormalizedPoint[], pageHeightPt: number, hint: MarginTrimHint) {
  const first = points[0];
  const second = points[1];
  if (!first || !second) return { points, marginContinuation: undefined };
  if (points.length <= 2) return computeMarginContinuationTrim(first, second, pageHeightPt, hint);
  const next = points.map((point) => ({ ...point }));
  const last = next.length - 1;
  const head = computeMarginContinuationTrim(next[0]!, next[1]!, pageHeightPt, hint === "end" ? "center" : hint);
  const tail = computeMarginContinuationTrim(next[last - 1]!, next[last]!, pageHeightPt, hint === "start" ? "center" : hint);
  next[0] = head.points[0];
  next[last] = tail.points[1];
  return { points: next, marginContinuation: tail.marginContinuation ?? head.marginContinuation };
}

export function selectMark(id: string): void {
  session().select("mark", id);
  const mark = edits.findMark(v2(), id);
  const shotId = mark && mark.kind !== "image" ? mark.shotId : undefined;
  const scene = v2().scenes.find((item) => item.shots.some((shot) => shot.id === shotId));
  if (scene) session().setSceneCollapsed(scene.id, false);
}

/** Caption text used when a line's label lock opens. */
export function currentLineLabel(id: string): string {
  const base = lineMark(id);
  if (!base) return "";
  const shown = legacyLine(base, v2(), shotTypeUnlocked.has(id));
  return getLineDisplayLabel(shown, toLegacyProject(v2()));
}
