/**
 * One segment of a line, in PDF points. The page scales the result; the PDF
 * export draws it as it is.
 */
import type { PatternTune } from "../model/types";

export type { PatternTune };

export type StrokePoint = { x: number; y: number };

export type StrokeStrand = {
  points: StrokePoint[];
  widthPt: number;
  /** Dash lengths in PDF points. Missing means a solid strand. */
  dash?: number[];
  /** 1 is normal ink. Hidden lines are fainter so they can still be found. */
  opacity: number;
  /** Hidden lines stay on screen and are left out of the PDF. */
  export: boolean;
};

/** Patterns the page can draw. Older dash keys stay so saved lines look the same. */
export const PRIMARY_PATTERNS = [
  "straight",
  "dashes",
  "dotted",
  "wavy",
  "zigzag",
  "double",
  "triple",
  "hashed",
  "straightWavy",
  "hidden",
];

const LEGACY_DASHES = ["dashed_2_2", "dashed_3_3", "dashed_4_4", "dashed_4_3_2_3", "dashed_4_3_16_3", "dashed_8_4_4_4"];

export type TuneField = "length" | "gap" | "amplitude" | "side";

export function tuneKey(field: TuneField): keyof PatternTune {
  if (field === "length") return "lengthPct";
  if (field === "gap") return "gapPct";
  if (field === "amplitude") return "amplitudePct";
  return "waveSide";
}

/** The patterns to offer: built-in ones, then custom ones already in use, then the current one. */
export function patternKeys(current: string, custom: string[] = []): string[] {
  const keys = [...PRIMARY_PATTERNS, ...LEGACY_DASHES];
  for (const key of [...custom, current]) if (key && !keys.includes(key)) keys.push(key);
  return keys;
}

/** Which adjustments apply to this pattern. Straight and hidden have none. */
export function patternFields(pattern: string): TuneField[] {
  const key = pattern === "solid" ? "straight" : pattern;
  if (key === "straight" || key === "hidden") return [];
  if (key === "wavy" || key === "zigzag") return ["length", "amplitude"];
  if (key === "straightWavy") return ["length", "amplitude", "side"];
  if (key === "double" || key === "triple" || key === "hashed") return ["gap"];
  return ["length", "gap"];
}

export function tuneLabel(pattern: string, field: TuneField): string {
  if (field === "amplitude") return "Amplitude";
  if (field === "side") return "Wavy side";
  if (field === "length") {
    if (pattern === "dotted") return "Dot size";
    if (pattern === "wavy" || pattern === "zigzag" || pattern === "straightWavy") return "Wavelength";
    return "Dash size";
  }
  return "Gap";
}

/** Strands for the segment from `a` to `b`. Every percentage defaults to 100. */
export function segmentStrands(
  a: StrokePoint,
  b: StrokePoint,
  pattern: string,
  widthPt: number,
  tune: PatternTune = {}
): StrokeStrand[] {
  const width = Math.max(0.25, widthPt);
  const lengthScale = pct(tune.lengthPct ?? tune.patternSizePct);
  const gapScale = pct(tune.gapPct ?? tune.patternSizePct);
  const ampScale = pct(tune.amplitudePct ?? tune.patternSizePct);
  const size = pct(tune.patternSizePct);
  const side = tune.waveSide === "left" ? -1 : 1;
  const key = pattern === "solid" ? "straight" : pattern;
  if (key === "hidden") return [strand([a, b], width, { opacity: 0.35, export: false })];
  if (key === "double") return parallel(a, b, width, gapScale, [-1, 1]);
  if (key === "triple") return parallel(a, b, width, gapScale, [-1, 0, 1]);
  if (key === "wavy") return [strand(wave(a, b, width, lengthScale, ampScale, 0), width)];
  if (key === "zigzag") return [strand(zigzag(a, b, width, lengthScale, ampScale), width)];
  if (key === "straightWavy") {
    const amp = width * 2.5 * ampScale;
    return [strand([a, b], width), strand(wave(a, b, width, lengthScale, ampScale, side * (amp + width)), width)];
  }
  if (key === "hashed") return [strand([a, b], width), ...ticks(a, b, width, size, gapScale)];
  const dash = dashParts(key, width, lengthScale, gapScale);
  return [strand([a, b], width, dash ? { dash } : {})];
}

function pct(value: number | undefined): number {
  return Math.max(0.1, (value ?? 100) / 100);
}

function strand(
  points: StrokePoint[],
  widthPt: number,
  extra?: { dash?: number[]; opacity?: number; export?: boolean }
): StrokeStrand {
  return {
    points,
    widthPt,
    dash: extra?.dash,
    opacity: extra?.opacity ?? 1,
    export: extra?.export ?? true,
  };
}

function dashParts(pattern: string, width: number, lengthScale: number, gapScale: number): number[] | undefined {
  const units = dashUnits(pattern === "dashes" ? "dashed_4_4" : pattern);
  if (!units) return undefined;
  return units.map((part, index) => part * width * (index % 2 === 0 ? lengthScale : gapScale));
}

/**
 * Custom dash patterns are written into the pattern name: "dashed_8_3_2_3" is
 * dash 8, gap 3, dash 2, gap 3, in line widths. The built-in dashed patterns
 * use the same form, so a custom one needs no new file format.
 */
export function parseDashKey(pattern: string): number[] | undefined {
  if (!/^dashed(_\d+(\.\d+)?)+$/.test(pattern)) return undefined;
  const units = pattern.split("_").slice(1).map(Number);
  return units.some((u) => u > 0) ? units : undefined;
}

/** The pattern name for a dash sequence typed as "8 3 2 3", or null when it can't be one. */
export function customDashKey(text: string): string | null {
  const parts = text.trim().split(/[\s,;·-]+/).filter(Boolean);
  if (parts.length === 0 || parts.length > 8) return null;
  const units = parts.map(Number);
  if (units.some((u) => !Number.isFinite(u) || u < 0 || u > 99) || !units.some((u) => u > 0)) return null;
  return `dashed_${units.map((u) => Math.round(u * 10) / 10).join("_")}`;
}

/** A custom dash pattern's name for the list: "Dashes 8-3-2-3". */
export function customDashLabel(pattern: string): string | null {
  if (LEGACY_DASHES.includes(pattern)) return null;
  const units = parseDashKey(pattern);
  return units ? `Dashes ${units.join("-")}` : null;
}

function dashUnits(pattern: string): number[] | undefined {
  switch (pattern) {
    case "dashed_2_2":
      return [2, 2];
    case "dashed_3_3":
      return [3, 3];
    case "dashed_4_4":
      return [4, 4];
    case "dashed_4_3_2_3":
      return [4, 3, 2, 3];
    case "dashed_4_3_16_3":
      return [4, 3, 16, 3];
    case "dashed_8_4_4_4":
      return [8, 4, 4, 4];
    case "dotted":
      return [1, 2];
    default:
      return parseDashKey(pattern) ?? (LEGACY_DASHES.includes(pattern) ? [4, 4] : undefined);
  }
}

function parallel(a: StrokePoint, b: StrokePoint, width: number, gapScale: number, slots: number[]): StrokeStrand[] {
  const gap = width * 1.6 * gapScale;
  const n = normal(a, b);
  return slots.map((slot) => {
    const shift = gap * slot;
    return strand(
      [
        { x: a.x + n.x * shift, y: a.y + n.y * shift },
        { x: b.x + n.x * shift, y: b.y + n.y * shift },
      ],
      width
    );
  });
}

function wave(a: StrokePoint, b: StrokePoint, width: number, lengthScale: number, ampScale: number, bias: number): StrokePoint[] {
  const len = length(a, b);
  if (len < 0.5) return [a, b];
  const dir = unit(a, b);
  const n = normal(a, b);
  const amp = width * 2.5 * ampScale;
  const period = Math.max(width * 8 * lengthScale, 4);
  const step = Math.max(period / 8, len / 240);
  const points: StrokePoint[] = [];
  for (let along = 0; along < len; along += step) {
    const lift = Math.sin((along / period) * Math.PI * 2) * amp + bias;
    points.push(moved(a, dir, n, along, lift));
  }
  points.push(moved(a, dir, n, len, Math.sin((len / period) * Math.PI * 2) * amp + bias));
  return points;
}

function zigzag(a: StrokePoint, b: StrokePoint, width: number, lengthScale: number, ampScale: number): StrokePoint[] {
  const len = length(a, b);
  if (len < 0.5) return [a, b];
  const dir = unit(a, b);
  const n = normal(a, b);
  const amp = width * 2.5 * ampScale;
  const period = Math.max(width * 8 * lengthScale, 4);
  const points: StrokePoint[] = [a];
  for (let along = period / 4; along < len; along += period / 2) {
    const crest = Math.sin((along / period) * Math.PI * 2) >= 0 ? amp : -amp;
    points.push(moved(a, dir, n, Math.min(along, len), crest));
  }
  points.push(b);
  return points;
}

function ticks(a: StrokePoint, b: StrokePoint, width: number, size: number, gapScale: number): StrokeStrand[] {
  const len = length(a, b);
  const spacing = Math.max(width * 6 * gapScale, 4);
  const half = width * 2.2 * size;
  const dir = unit(a, b);
  const n = normal(a, b);
  const strands: StrokeStrand[] = [];
  for (let along = spacing / 2; along < len; along += spacing) {
    const at = moved(a, dir, n, along, 0);
    strands.push(
      strand(
        [
          { x: at.x + n.x * half, y: at.y + n.y * half },
          { x: at.x - n.x * half, y: at.y - n.y * half },
        ],
        width
      )
    );
  }
  return strands;
}

function length(a: StrokePoint, b: StrokePoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function unit(a: StrokePoint, b: StrokePoint): StrokePoint {
  const len = length(a, b) || 1;
  return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
}

function normal(a: StrokePoint, b: StrokePoint): StrokePoint {
  const dir = unit(a, b);
  return { x: -dir.y, y: dir.x };
}

function moved(origin: StrokePoint, dir: StrokePoint, n: StrokePoint, along: number, lift: number): StrokePoint {
  return { x: origin.x + dir.x * along + n.x * lift, y: origin.y + dir.y * along + n.y * lift };
}

/* ---------- curves ---------- */

/** Points on the smooth curve from `a` to `b` (Catmull-Rom), shaped by the points before and after. */
export function curveSpan(prev: StrokePoint, a: StrokePoint, b: StrokePoint, next: StrokePoint, steps = 20): StrokePoint[] {
  const out: StrokePoint[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const t2 = t * t;
    const t3 = t2 * t;
    const at = (p0: number, p1: number, p2: number, p3: number) =>
      0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    out.push({ x: at(prev.x, a.x, b.x, next.x), y: at(prev.y, a.y, b.y, next.y) });
  }
  return out;
}

/** The span of a smoothed path from point `i` to `i + 1`. Open paths repeat their end points. */
export function smoothSpan(points: StrokePoint[], i: number, closed: boolean): StrokePoint[] {
  const n = points.length;
  const pick = (k: number) => (closed ? points[((k % n) + n) % n]! : points[Math.max(0, Math.min(n - 1, k))]!);
  return curveSpan(pick(i - 1), pick(i), pick(i + 1), pick(i + 2));
}

/** A whole smoothed path through the points, as a polyline. */
export function smoothPath(points: StrokePoint[], closed: boolean): StrokePoint[] {
  if (points.length < 3) return closed && points.length > 0 ? [...points, points[0]!] : points;
  const spans = closed ? points.length : points.length - 1;
  const out: StrokePoint[] = [];
  for (let i = 0; i < spans; i += 1) {
    const span = smoothSpan(points, i, closed);
    out.push(...(i === 0 ? span : span.slice(1)));
  }
  return out;
}

function polylineLength(points: StrokePoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += length(points[i - 1]!, points[i]!);
  return total;
}

/** The polyline with `start` and `end` points' worth of length cut off its ends (to make room for endings). */
export function trimPolyline(points: StrokePoint[], start: number, end: number): StrokePoint[] {
  const cut = (pts: StrokePoint[], by: number): StrokePoint[] => {
    let left = by;
    for (let i = 1; i < pts.length; i += 1) {
      const seg = length(pts[i - 1]!, pts[i]!);
      if (seg >= left) {
        const t = seg > 0 ? left / seg : 0;
        const a = pts[i - 1]!;
        const b = pts[i]!;
        return [{ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, ...pts.slice(i)];
      }
      left -= seg;
    }
    return [pts[pts.length - 1]!];
  };
  let out = start > 0 ? cut(points, start) : points;
  if (end > 0) out = cut([...out].reverse(), end).reverse();
  return out.length >= 2 ? out : points.slice(0, 2);
}

/**
 * Strands for a pattern laid along any path: the pattern is made along a
 * straight run as long as the path, then bent onto it, so waves, zigzags,
 * parallel strands and ticks follow the curve.
 */
export function polylineStrands(path: StrokePoint[], pattern: string, widthPt: number, tune: PatternTune = {}): StrokeStrand[] {
  const total = polylineLength(path);
  if (path.length < 2 || total < 0.5) return path.length >= 2 ? segmentStrands(path[0]!, path[path.length - 1]!, pattern, widthPt, tune) : [];
  const cumulative = [0];
  for (let i = 1; i < path.length; i += 1) cumulative.push(cumulative[i - 1]! + length(path[i - 1]!, path[i]!));
  const place = (u: number, v: number): StrokePoint => {
    const along = Math.max(0, Math.min(total, u));
    let i = 1;
    while (i < path.length - 1 && cumulative[i]! < along) i += 1;
    const a = path[i - 1]!;
    const b = path[i]!;
    const seg = cumulative[i]! - cumulative[i - 1]! || 1;
    const t = (along - cumulative[i - 1]!) / seg;
    const n = normal(a, b);
    return { x: a.x + (b.x - a.x) * t + n.x * v, y: a.y + (b.y - a.y) * t + n.y * v };
  };
  const step = Math.max(1, Math.min(4, widthPt));
  return segmentStrands({ x: 0, y: 0 }, { x: total, y: 0 }, pattern, widthPt, tune).map((strand) => {
    // Fill in long straight runs so they can bend with the path.
    const dense: StrokePoint[] = [];
    strand.points.forEach((p, i) => {
      const prev = strand.points[i - 1];
      if (prev) {
        const gap = length(prev, p);
        for (let k = 1; k < Math.floor(gap / step); k += 1) {
          const t = (k * step) / gap;
          dense.push({ x: prev.x + (p.x - prev.x) * t, y: prev.y + (p.y - prev.y) * t });
        }
      }
      dense.push(p);
    });
    return { ...strand, points: dense.map((p) => place(p.x, p.y)) };
  });
}
