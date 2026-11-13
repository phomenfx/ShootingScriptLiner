/*
 * Box shapes in PDF points (top-left origin, y down), shared by the page and
 * the PDF export so both draw the same thing.
 */
import type { Project, ShapeMark } from "../model/types";
import type { Point } from "./geometry";

/** Shapes offered by the Shape tool. Older files may still hold a "bracket", which keeps drawing. */
export const SHAPE_KINDS = ["rectangle", "ellipse", "highlight", "polygon", "star", "stamp"] as const;
/** Shapes whose outline closes and can be filled. A pen or polygon path fills when it is closed. */
export const FILLABLE_SHAPES = ["rectangle", "ellipse", "highlight", "polygon", "star"];

export function isFillable(shape: ShapeMark): boolean {
  return FILLABLE_SHAPES.includes(shape.shape) || (shape.shape === "path" && !!shape.path?.closed);
}
/** Smallest box a drawn shape may have, in points. */
export const MIN_SHAPE_PT = 4;

const ELLIPSE_STEPS = 72;

export type ShapeOutline = {
  /** Page points after rotation. */
  points: Point[];
  closed: boolean;
};

export function shapeCenter(shape: Pick<ShapeMark, "x" | "y" | "widthPt" | "heightPt">): Point {
  return { x: shape.x + shape.widthPt / 2, y: shape.y + shape.heightPt / 2 };
}

/** Turns a point given relative to the box center (before rotation) into a page point. */
export function rotateAround(center: Point, local: Point, degrees: number): Point {
  const r = (degrees * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return { x: center.x + local.x * cos - local.y * sin, y: center.y + local.x * sin + local.y * cos };
}

/** The inverse: a page point as seen from the box center before rotation. */
export function toLocal(center: Point, page: Point, degrees: number): Point {
  const r = (-degrees * Math.PI) / 180;
  const dx = page.x - center.x;
  const dy = page.y - center.y;
  return { x: dx * Math.cos(r) - dy * Math.sin(r), y: dx * Math.sin(r) + dy * Math.cos(r) };
}

/** The outline of a shape, or null for stamps (drawn from the ending geometry instead). */
export function shapeOutline(shape: ShapeMark): ShapeOutline | null {
  const w = shape.widthPt / 2;
  const h = shape.heightPt / 2;
  let local: Point[];
  let closed = true;
  switch (shape.shape) {
    case "ellipse":
      local = Array.from({ length: ELLIPSE_STEPS }, (_, i) => {
        const a = (i / ELLIPSE_STEPS) * Math.PI * 2;
        return { x: Math.cos(a) * w, y: Math.sin(a) * h };
      });
      break;
    case "polygon": {
      const sides = Math.max(3, Math.min(64, Math.round(shape.sides ?? 6)));
      local = Array.from({ length: sides }, (_, i) => {
        const a = -Math.PI / 2 + (i / sides) * Math.PI * 2;
        return { x: Math.cos(a) * w, y: Math.sin(a) * h };
      });
      break;
    }
    case "star": {
      const tips = Math.max(3, Math.min(64, Math.round(shape.points ?? 5)));
      const inner = 1 - Math.max(0, Math.min(95, shape.innerDepthPct ?? 50)) / 100;
      local = Array.from({ length: tips * 2 }, (_, i) => {
        const a = -Math.PI / 2 + (i / (tips * 2)) * Math.PI * 2;
        const k = i % 2 === 0 ? 1 : inner;
        return { x: Math.cos(a) * w * k, y: Math.sin(a) * h * k };
      });
      break;
    }
    case "bracket":
      // An open square bracket: arms along the top and bottom, a bar down the left side.
      local = [
        { x: w, y: -h },
        { x: -w, y: -h },
        { x: -w, y: h },
        { x: w, y: h },
      ];
      closed = false;
      break;
    case "stamp":
      return null;
    case "path": {
      const path = shape.path;
      if (!path || path.points.length < 2) return null;
      local = path.points.map((p) => ({ x: (p.x - 0.5) * shape.widthPt, y: (p.y - 0.5) * shape.heightPt }));
      closed = path.closed && path.points.length >= 3;
      break;
    }
    default:
      local = [
        { x: -w, y: -h },
        { x: w, y: -h },
        { x: w, y: h },
        { x: -w, y: h },
      ];
  }
  const center = shapeCenter(shape);
  return { points: local.map((p) => rotateAround(center, p, shape.rotation)), closed };
}

/**
 * Drops points that sit within `tolerance` of the line through their
 * neighbours (Ramer–Douglas–Peucker), so a freehand stroke keeps its shape
 * with far fewer points.
 */
export function simplifyPoints(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points;
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const pa = points[a]!;
    const pb = points[b]!;
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const len = Math.hypot(dx, dy) || 1;
    let worst = -1;
    let far = 0;
    for (let i = a + 1; i < b; i += 1) {
      const p = points[i]!;
      const d = Math.abs((p.x - pa.x) * dy - (p.y - pa.y) * dx) / len;
      if (d > far) {
        far = d;
        worst = i;
      }
    }
    if (worst >= 0 && far > tolerance) {
      keep[worst] = true;
      stack.push([a, worst], [worst, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** The box and box-relative corners for a path drawn in page points. */
export function pathBox(points: Point[]): { x: number; y: number; widthPt: number; heightPt: number; path: Point[] } {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  let minX = Math.min(...xs);
  let minY = Math.min(...ys);
  let w = Math.max(...xs) - minX;
  let h = Math.max(...ys) - minY;
  // A flat stroke still gets a box that can be grabbed and resized.
  if (w < MIN_SHAPE_PT) {
    minX -= (MIN_SHAPE_PT - w) / 2;
    w = MIN_SHAPE_PT;
  }
  if (h < MIN_SHAPE_PT) {
    minY -= (MIN_SHAPE_PT - h) / 2;
    h = MIN_SHAPE_PT;
  }
  return { x: minX, y: minY, widthPt: w, heightPt: h, path: points.map((p) => ({ x: (p.x - minX) / w, y: (p.y - minY) / h })) };
}

/** The edges to stroke, each from one outline point to the next. */
export function outlineEdges(outline: ShapeOutline): [Point, Point][] {
  const pts = outline.points;
  const count = outline.closed ? pts.length : pts.length - 1;
  return Array.from({ length: count }, (_, i) => [pts[i]!, pts[(i + 1) % pts.length]!]);
}

/** A shape is drawn unless its shot or that shot's scene is hidden. */
export function isShapeShown(project: Project, shape: ShapeMark): boolean {
  if (!shape.shotId) return true;
  for (const scene of project.scenes) {
    const shot = scene.shots.find((s) => s.id === shape.shotId);
    if (shot) return shot.visible && scene.visible;
  }
  return true;
}

export function shapeColor(project: Project, shape: ShapeMark): string {
  if (shape.color) return shape.color;
  const shot = shape.shotId ? project.scenes.flatMap((scene) => scene.shots).find((s) => s.id === shape.shotId) : undefined;
  return shot?.color ?? project.settings.general.newShotColor;
}

/** Whether the shape draws a stroke. A highlight is fill only. */
export function shapeHasStroke(shape: ShapeMark): boolean {
  return shape.shape !== "highlight" && !!shape.stroke && shape.stroke.widthPt > 0;
}

/** The fill to draw, or null. A highlight always fills. */
export function shapeFill(project: Project, shape: ShapeMark): { color: string; opacity: number } | null {
  if (!isFillable(shape)) return null;
  const fill = shape.fill ?? (shape.shape === "highlight" ? { opacityPct: 100 } : undefined);
  if (!fill) return null;
  return { color: fill.color ?? shapeColor(project, shape), opacity: Math.max(0, Math.min(100, fill.opacityPct)) / 100 };
}

/**
 * The halo drawn under a shape: every stroke again, in the outline color and
 * wider by the outline width on each side. Highlights have none.
 */
export function shapeHalo(shape: ShapeMark): { color: string; widthPt: number } | null {
  if (!shape.outline || shape.shape === "highlight" || shape.outline.widthPt <= 0) return null;
  return shape.outline;
}

/** Ending size that fills a stamp's box. */
export function stampScalePercent(shape: ShapeMark): number {
  return (Math.min(shape.widthPt, shape.heightPt) / 8) * 100 * 0.9;
}

/**
 * Where a stamp's ending tip goes so the figure sits in the middle of the box.
 * Endings are drawn with the tip at the origin and the figure behind it.
 */
export function stampTip(shape: ShapeMark): Point {
  const s = Math.min(shape.widthPt, shape.heightPt) * 0.9;
  const back: Record<string, number> = { arrow: 0.5, doubleArrow: 0.8, bracket: 0.2, arrowReversed: -0.5 };
  const shift = (back[shape.stamp ?? "arrow"] ?? 0) * s;
  const r = (shape.rotation * Math.PI) / 180;
  const c = shapeCenter(shape);
  return { x: c.x + Math.cos(r) * shift, y: c.y + Math.sin(r) * shift };
}

/** Whether a page point is on the shape: inside its box, allowing a margin. */
export function hitsShape(shape: ShapeMark, page: Point, marginPt: number): boolean {
  const local = toLocal(shapeCenter(shape), page, shape.rotation);
  return Math.abs(local.x) <= shape.widthPt / 2 + marginPt && Math.abs(local.y) <= shape.heightPt / 2 + marginPt;
}

export type ShapeHandle =
  | { kind: "resize"; sx: -1 | 0 | 1; sy: -1 | 0 | 1 }
  | { kind: "rotate" };

/** Handle spots in page points: eight resize handles and one rotate handle above the top edge. */
export function shapeHandles(shape: ShapeMark, rotateGapPt: number): { handle: ShapeHandle; at: Point }[] {
  const center = shapeCenter(shape);
  const w = shape.widthPt / 2;
  const h = shape.heightPt / 2;
  const out: { handle: ShapeHandle; at: Point }[] = [];
  for (const sy of [-1, 0, 1] as const) {
    for (const sx of [-1, 0, 1] as const) {
      if (sx === 0 && sy === 0) continue;
      out.push({ handle: { kind: "resize", sx, sy }, at: rotateAround(center, { x: sx * w, y: sy * h }, shape.rotation) });
    }
  }
  out.push({ handle: { kind: "rotate" }, at: rotateAround(center, { x: 0, y: -h - rotateGapPt }, shape.rotation) });
  return out;
}

/**
 * The shape after dragging a resize handle to `page`. The opposite side stays put.
 * With `keepRatio` the box keeps its proportions.
 */
export function resizeShape(origin: ShapeMark, handle: { sx: -1 | 0 | 1; sy: -1 | 0 | 1 }, page: Point, keepRatio: boolean): ShapeMark {
  const center = shapeCenter(origin);
  const w = origin.widthPt / 2;
  const h = origin.heightPt / 2;
  const local = toLocal(center, page, origin.rotation);
  // The fixed corner or edge, opposite the handle.
  const fixed = { x: -handle.sx * w, y: -handle.sy * h };
  let width = handle.sx === 0 ? origin.widthPt : Math.max(MIN_SHAPE_PT, (local.x - fixed.x) * handle.sx);
  let height = handle.sy === 0 ? origin.heightPt : Math.max(MIN_SHAPE_PT, (local.y - fixed.y) * handle.sy);
  if (keepRatio && handle.sx !== 0 && handle.sy !== 0) {
    const k = Math.max(width / origin.widthPt, height / origin.heightPt);
    width = origin.widthPt * k;
    height = origin.heightPt * k;
  }
  // New center in local coordinates, then back to the page.
  const localCenter = {
    x: handle.sx === 0 ? 0 : fixed.x + (handle.sx * width) / 2,
    y: handle.sy === 0 ? 0 : fixed.y + (handle.sy * height) / 2,
  };
  const c = rotateAround(center, localCenter, origin.rotation);
  return { ...origin, x: c.x - width / 2, y: c.y - height / 2, widthPt: width, heightPt: height };
}

/** The rotation that points the top of the shape at `page`, snapped to `snapDegrees` when given. */
export function rotationToward(shape: ShapeMark, page: Point, snapDegrees?: number): number {
  const c = shapeCenter(shape);
  let degrees = (Math.atan2(page.y - c.y, page.x - c.x) * 180) / Math.PI + 90;
  if (snapDegrees && snapDegrees > 0) degrees = Math.round(degrees / snapDegrees) * snapDegrees;
  return ((degrees % 360) + 360) % 360;
}
