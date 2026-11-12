import {
  distance,
  MIN_DRAG_NORMALIZED,
  offsetPointUnclamped,
  snapEndpoint,
} from "../lib/coords";
import type { NormalizedPoint } from "../types/annotations";

/** A stored point, or the handle in the middle of one segment. */
export type LineHandle = { kind: "vertex"; index: number } | { kind: "segment"; index: number };

type Point = { x: number; y: number };

/** Degrees away from the nearer of horizontal or vertical. */
function axisError(anchor: Point, pointer: Point): number {
  const dx = pointer.x - anchor.x;
  const dy = pointer.y - anchor.y;
  if (dx * dx + dy * dy < 1e-12) return 180;
  const angle = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
  return Math.min(angle, 90 - angle);
}

/**
 * Lock the pointer to a neighbor's horizontal or vertical. Two neighbors can
 * lock different axes at once, so a bend can sit square to both.
 */
function snapToNeighbors(
  neighbors: Point[],
  pointer: Point,
  snapDegrees: number,
  shiftKey: boolean
): Point {
  let x = pointer.x;
  let y = pointer.y;
  let bestX = Infinity;
  let bestY = Infinity;
  for (const neighbor of neighbors) {
    const snapped = snapEndpoint(neighbor, pointer, snapDegrees, shiftKey);
    const moved = snapped.x !== pointer.x || snapped.y !== pointer.y;
    if (!moved) continue;
    const error = axisError(neighbor, pointer);
    if (snapped.y === neighbor.y && error < bestY) {
      y = neighbor.y;
      bestY = error;
    } else if (snapped.x === neighbor.x && error < bestX) {
      x = neighbor.x;
      bestX = error;
    }
  }
  return { x, y };
}

/** Move one vertex, or slide a whole segment by dragging its midpoint. */
export function dragLinePoints(
  origin: NormalizedPoint[],
  handle: LineHandle,
  pointer: NormalizedPoint,
  snapDegrees: number,
  shiftKey: boolean
): NormalizedPoint[] {
  if (handle.kind === "vertex") {
    const neighbors = [origin[handle.index - 1], origin[handle.index + 1]].filter((point) => point !== undefined);
    const next = snapToNeighbors(neighbors, pointer, snapDegrees, shiftKey);
    return origin.map((point, index) => (index === handle.index ? next : point));
  }
  const a = origin[handle.index];
  const b = origin[handle.index + 1];
  if (!a || !b) return origin;
  const freeDx = pointer.x - (a.x + b.x) / 2;
  const freeDy = pointer.y - (a.y + b.y) / 2;
  let dx = freeDx;
  let dy = freeDy;
  const joints: { moving: Point; still: Point }[] = [];
  const before = origin[handle.index - 1];
  const after = origin[handle.index + 2];
  if (before) joints.push({ moving: a, still: before });
  if (after) joints.push({ moving: b, still: after });
  let bestX = Infinity;
  let bestY = Infinity;
  for (const joint of joints) {
    const proposed = { x: joint.moving.x + freeDx, y: joint.moving.y + freeDy };
    const snapped = snapEndpoint(joint.still, proposed, snapDegrees, shiftKey);
    if (snapped.x === proposed.x && snapped.y === proposed.y) continue;
    const error = axisError(joint.still, proposed);
    if (snapped.y === joint.still.y && error < bestY) {
      dy = joint.still.y - joint.moving.y;
      bestY = error;
    } else if (snapped.x === joint.still.x && error < bestX) {
      dx = joint.still.x - joint.moving.x;
      bestX = error;
    }
  }
  return origin.map((point, index) =>
    index === handle.index || index === handle.index + 1 ? offsetPointUnclamped(point, dx, dy) : point
  );
}

export function drawPreviewEnd(
  start: NormalizedPoint,
  pointer: NormalizedPoint,
  snapDegrees: number,
  shiftKey: boolean
): NormalizedPoint {
  return snapEndpoint(start, pointer, snapDegrees, shiftKey);
}

/** End point of a finished stroke. A click with no drag still makes a short line. */
export function finishDrawEnd(
  start: NormalizedPoint,
  pointer: NormalizedPoint,
  snapDegrees: number,
  shiftKey: boolean
): NormalizedPoint {
  const end = snapEndpoint(start, pointer, snapDegrees, shiftKey);
  if (distance(start, end) < MIN_DRAG_NORMALIZED) {
    return { x: start.x, y: start.y + MIN_DRAG_NORMALIZED };
  }
  return end;
}

/** Points of an Alt-drag copy. The pointer is where the original start should land. */
export function clonedLinePoints(origin: NormalizedPoint[], pointer: NormalizedPoint): NormalizedPoint[] {
  const first = origin[0];
  if (!first) return origin;
  const dx = pointer.x - first.x;
  const dy = pointer.y - first.y;
  return origin.map((point) => offsetPointUnclamped(point, dx, dy));
}

export function longestSegmentIndex(points: Point[]): number {
  let best = 0;
  let bestLength = -1;
  for (let index = 0; index < points.length - 1; index += 1) {
    const length = distance(points[index]!, points[index + 1]!);
    if (length > bestLength) {
      best = index;
      bestLength = length;
    }
  }
  return best;
}

/** Insert a vertex on a segment. Without `at`, the vertex sits at the segment's midpoint. */
export function splitPoints<T extends Point>(points: T[], segmentIndex: number, at?: T): T[] | null {
  const a = points[segmentIndex];
  const b = points[segmentIndex + 1];
  if (!a || !b) return null;
  const point = at ?? ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } as T);
  return [...points.slice(0, segmentIndex + 1), point, ...points.slice(segmentIndex + 1)];
}

/** Which interior vertex Rejoin removes. The middle one, unless a vertex is named. */
export function rejoinIndex(points: Point[], vertexIndex?: number): number | null {
  if (points.length < 3) return null;
  const index = vertexIndex ?? Math.min(points.length - 2, Math.max(1, Math.floor(points.length / 2)));
  if (index <= 0 || index >= points.length - 1) return null;
  return index;
}

/** Remove one interior vertex so the segments on either side become one. */
export function rejoinPoints<T extends Point>(points: T[], vertexIndex?: number): T[] | null {
  const index = rejoinIndex(points, vertexIndex);
  if (index === null) return null;
  return [...points.slice(0, index), ...points.slice(index + 1)];
}

/** The point on a segment nearest the pointer, and which segment that is. */
export function closestOnLine(points: Point[], pointer: Point): { index: number; point: Point } | null {
  let best: { index: number; point: Point; distance: number } | null = null;
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index]!;
    const b = points[index + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq < 1e-12 ? 0 : Math.max(0, Math.min(1, ((pointer.x - a.x) * dx + (pointer.y - a.y) * dy) / lenSq));
    const point = { x: a.x + t * dx, y: a.y + t * dy };
    const gap = distance(pointer, point);
    if (!best || gap < best.distance) best = { index, point, distance: gap };
  }
  return best ? { index: best.index, point: best.point } : null;
}
