import type { PDFPage } from "pdf-lib";
import { degrees, rgb } from "pdf-lib";
import type { LineEnding } from "../types/annotations";
import { capSupportsFill } from "../types/annotations";

function scaleSize(lineWidthPt: number, scalePercent: number): number {
  return Math.max(3, lineWidthPt * 3.5) * (scalePercent / 100);
}

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
  lineWidth: number
): void {
  page.drawSvgPath(path, {
    x: cx,
    y: cy,
    rotate: degrees((angleRad * 180) / Math.PI),
    color: filled ? color : undefined,
    borderColor: color,
    borderWidth: filled ? Math.max(0.25, lineWidth * 0.25) : lineWidth,
  });
}

function drawPolyLines(
  page: PDFPage,
  points: { x: number; y: number }[],
  color: ReturnType<typeof rgb>,
  lineWidth: number
) {
  for (let i = 0; i < points.length - 1; i++) {
    page.drawLine({
      start: points[i]!,
      end: points[i + 1]!,
      thickness: lineWidth,
      color,
    });
  }
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
  atStart: boolean
): void {
  const cap = ending.cap;
  if (cap === "none") return;

  const color = hexToRgb(colorHex);
  const sw = Math.max(0.5, lineWidthPt * 0.85);
  const s = scaleSize(lineWidthPt, ending.scalePercent);
  const filled = ending.filled && capSupportsFill(cap);
  const outAngle = atStart ? angleRad + Math.PI : angleRad;
  const cos = Math.cos(outAngle);
  const sin = Math.sin(outAngle);

  const m = (lx: number, ly: number) => mapLocal(lx, ly, cx, cy, cos, sin);

  switch (cap) {
    case "arrow": {
      const path = filled
        ? `M ${-s} ${-s * 0.55} L 0 0 L ${-s} ${s * 0.55} Z`
        : `M ${-s} ${-s * 0.55} L 0 0 L ${-s} ${s * 0.55}`;
      if (filled) {
        drawLocalSvgPath(page, cx, cy, outAngle, path, color, true, sw);
      } else {
        const pTip = m(0, 0);
        const pA = m(-s, -s * 0.55);
        const pB = m(-s, s * 0.55);
        page.drawLine({ start: pA, end: pTip, thickness: sw, color });
        page.drawLine({ start: pB, end: pTip, thickness: sw, color });
      }
      break;
    }
    case "arrowReversed": {
      const path = filled
        ? `M ${s} ${-s * 0.55} L 0 0 L ${s} ${s * 0.55} Z`
        : `M ${s} ${-s * 0.55} L 0 0 L ${s} ${s * 0.55}`;
      if (filled) {
        drawLocalSvgPath(page, cx, cy, outAngle, path, color, true, sw);
      } else {
        const pTip = m(0, 0);
        const pA = m(s, -s * 0.55);
        const pB = m(s, s * 0.55);
        page.drawLine({ start: pA, end: pTip, thickness: sw, color });
        page.drawLine({ start: pB, end: pTip, thickness: sw, color });
      }
      break;
    }
    case "square": {
      const h = s * 0.7;
      const path = `M ${-h / 2} ${-h / 2} L ${h / 2} ${-h / 2} L ${h / 2} ${h / 2} L ${-h / 2} ${h / 2} Z`;
      if (filled) {
        drawLocalSvgPath(page, cx, cy, outAngle, path, color, true, sw);
      } else {
        const pts = [m(-h / 2, -h / 2), m(h / 2, -h / 2), m(h / 2, h / 2), m(-h / 2, h / 2), m(-h / 2, -h / 2)];
        drawPolyLines(page, pts, color, sw);
      }
      break;
    }
    case "circle": {
      const r = s * 0.4;
      page.drawCircle({
        x: cx,
        y: cy,
        size: r * 2,
        borderColor: color,
        borderWidth: sw,
        color: filled ? color : undefined,
      });
      break;
    }
    case "diamond": {
      const h = s * 0.55;
      const path = `M 0 ${-h} L ${h * 0.65} 0 L 0 ${h} L ${-h * 0.65} 0 Z`;
      if (filled) {
        drawLocalSvgPath(page, cx, cy, outAngle, path, color, true, sw);
      } else {
        const pts = [m(0, -h), m(h * 0.65, 0), m(0, h), m(-h * 0.65, 0), m(0, -h)];
        drawPolyLines(page, pts, color, sw);
      }
      break;
    }
    case "butt": {
      const a = m(0, -s * 0.5);
      const b = m(0, s * 0.5);
      page.drawLine({ start: a, end: b, thickness: sw, color });
      break;
    }
    case "slash": {
      const a = m(-s * 0.35, -s * 0.5);
      const b = m(s * 0.35, s * 0.5);
      page.drawLine({ start: a, end: b, thickness: sw, color });
      break;
    }
    default:
      break;
  }
}
