import type { PDFPage } from "pdf-lib";
import { degrees, rgb } from "pdf-lib";
import { endingGeometry } from "./geometry";
import type { LineEnding } from "../types/annotations";

function hexToRgb(hex: string) {
  const h = hex.replace("#", "").trim();
  if (h.length === 3) {
    return rgb(
      parseInt(h[0]! + h[0], 16) / 255,
      parseInt(h[1]! + h[1], 16) / 255,
      parseInt(h[2]! + h[2], 16) / 255
    );
  }
  if (h.length !== 6) return rgb(0, 0, 0);
  return rgb(
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255
  );
}

/** Map local (tip at origin, +x outward) to PDF page coords. */
function mapLocal(
  lx: number,
  ly: number,
  cx: number,
  cy: number,
  cos: number,
  sin: number
): { x: number; y: number } {
  return { x: cx + lx * cos - ly * sin, y: cy + lx * sin + ly * cos };
}

/** drawSvgPath expects local SVG coords; position with x/y and rotate (degrees). */
function drawLocalSvgPath(
  page: PDFPage,
  cx: number,
  cy: number,
  angleRad: number,
  path: string,
  color: ReturnType<typeof rgb>,
  filled: boolean,
  lineWidth: number,
  haloPt = 0
): void {
  page.drawSvgPath(path, {
    x: cx,
    y: cy,
    rotate: degrees((angleRad * 180) / Math.PI),
    color: filled ? color : undefined,
    borderColor: color,
    borderWidth: (filled ? Math.max(0.25, lineWidth * 0.25) : lineWidth) + haloPt * 2,
  });
}

/**
 * Draw a line ending at (cx, cy). `angleRad` is the line direction (start → end) in PDF coords.
 * `atStart`: cap sits on the start point and points opposite the line direction.
 */
export function drawPdfLineCap(
  page: PDFPage,
  cx: number,
  cy: number,
  angleRad: number,
  ending: LineEnding,
  colorHex: string,
  lineWidthPt: number,
  atStart: boolean,
  /** Draws the ending as an outline: this much wider on every side. */
  haloPt = 0
): void {
  const geo = endingGeometry(ending, lineWidthPt);
  if (!geo) return;

  const color = hexToRgb(colorHex);
  const outAngle = atStart ? angleRad + Math.PI : angleRad;
  const cos = Math.cos(outAngle);
  const sin = Math.sin(outAngle);
  const primitive = geo.primitive;

  if (primitive.kind === "path") {
    drawLocalSvgPath(page, cx, cy, outAngle, primitive.d, color, primitive.filled, geo.strokePt, haloPt);
    return;
  }
  if (primitive.kind === "circle") {
    page.drawCircle({
      x: cx,
      y: cy,
      size: primitive.r * 2,
      borderColor: color,
      borderWidth: geo.strokePt + haloPt * 2,
      color: primitive.filled ? color : undefined,
    });
    return;
  }
  for (const [a, b] of primitive.segments) {
    page.drawLine({
      start: mapLocal(a.x, a.y, cx, cy, cos, sin),
      end: mapLocal(b.x, b.y, cx, cy, cos, sin),
      thickness: geo.strokePt + haloPt * 2,
      color,
    });
  }
}
