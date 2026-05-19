import type { NormalizedPoint } from "../types/annotations";

/** Snap on when degrees > 0, or while Shift is held (PDF-XChange style). */
export function isSnapEnabled(snapAngleDegrees: number, shiftKey: boolean): boolean {
  return shiftKey || snapAngleDegrees > 0;
}

export function snapThresholdDegrees(snapAngleDegrees: number, shiftKey: boolean): number {
  if (shiftKey && snapAngleDegrees <= 0) return 15;
  return snapAngleDegrees;
}

export function clientToNormalized(
  clientX: number,
  clientY: number,
  rect: DOMRect
): NormalizedPoint {
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;
  return {
    x: clamp01(x),
    y: clamp01(y),
  };
}

/** Page coordinates without clamping — for cross-page line drag. */
export function clientToNormalizedUnclamped(
  clientX: number,
  clientY: number,
  rect: DOMRect
): NormalizedPoint {
  return {
    x: (clientX - rect.left) / rect.width,
    y: (clientY - rect.top) / rect.height,
  };
}

export function normalizedToPx(
  p: NormalizedPoint,
  width: number,
  height: number
): { x: number; y: number } {
  return { x: p.x * width, y: p.y * height };
}

export function distance(a: NormalizedPoint, b: NormalizedPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function midpoint(
  a: NormalizedPoint,
  b: NormalizedPoint
): NormalizedPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Snap end point to horizontal or vertical from start when within threshold degrees. */
export function snapEndpoint(
  start: NormalizedPoint,
  end: NormalizedPoint,
  snapAngleDegrees: number,
  shiftKey: boolean
): NormalizedPoint {
  if (!isSnapEnabled(snapAngleDegrees, shiftKey)) return end;
  const thresholdDeg = snapThresholdDegrees(snapAngleDegrees, shiftKey);

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-6) return end;

  const angleDeg = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;

  if (angleDeg <= thresholdDeg) {
    return { x: end.x, y: start.y };
  }
  if (90 - angleDeg <= thresholdDeg) {
    return { x: start.x, y: end.y };
  }
  return end;
}

export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function offsetPoint(p: NormalizedPoint, dx: number, dy: number): NormalizedPoint {
  return { x: clamp01(p.x + dx), y: clamp01(p.y + dy) };
}

export function offsetPointUnclamped(
  p: NormalizedPoint,
  dx: number,
  dy: number
): NormalizedPoint {
  return { x: p.x + dx, y: p.y + dy };
}

/** Minimum normalized distance to treat click-drag as intentional (else show handles). */
export const MIN_DRAG_NORMALIZED = 0.008;
