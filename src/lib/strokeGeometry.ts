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

export function patternKeys(current: string): string[] {
  const keys = [...PRIMARY_PATTERNS, ...LEGACY_DASHES];
  if (current && !keys.includes(current)) keys.push(current);
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
      return LEGACY_DASHES.includes(pattern) ? [4, 4] : undefined;
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
