import { patternFields, tuneKey, type TuneField } from "../lib/strokeGeometry";
import type { LineMark, PatternTune, SegmentStyle, Stroke, WaveSide } from "./types";

const TUNE_KEYS = ["patternSizePct", "lengthPct", "gapPct", "amplitudePct", "waveSide"] as const;
const STYLE_KEYS = ["pattern", "widthPt", ...TUNE_KEYS] as const;

export type SegmentLook = SegmentStyle & { pattern: string; widthPt: number };

/** Pattern, width, and pattern adjustments for one segment. A missing entry follows the line. */
export function segmentLook(line: LineMark, index: number): SegmentLook {
  const own = line.segments?.[index];
  const look: SegmentLook = {
    pattern: own?.pattern ?? line.stroke.pattern,
    widthPt: own?.widthPt ?? line.stroke.widthPt,
  };
  for (const key of TUNE_KEYS) {
    const value = own && key in own ? own[key] : line.stroke[key];
    if (value !== undefined) look[key] = value as never;
  }
  return look;
}

/** Stores a pattern on one segment. The line's own pattern is not copied onto it. */
export function setSegmentPattern(line: LineMark, index: number, pattern: string): LineMark {
  return writeSegment(line, index, pattern === line.stroke.pattern ? { pattern: undefined } : { pattern });
}

/** Stores a width on one segment. Pass `undefined` to follow the line again. */
export function setSegmentWidth(line: LineMark, index: number, widthPt: number | undefined): LineMark {
  return writeSegment(line, index, { widthPt });
}

/** The percentage a field shows. A specific value wins; otherwise the older pattern size is used. */
export function tunePercent(tune: PatternTune, field: Exclude<TuneField, "side">): number {
  const specific = tune[tuneKey(field)];
  if (typeof specific === "number") return specific;
  return tune.patternSizePct ?? 100;
}

/**
 * Sets one pattern knob on the line. An older pattern size is copied onto the
 * other knobs for this pattern, then dropped, so changing one does not rescale the rest.
 */
export function editStrokeTune(stroke: Stroke, field: TuneField, value: number | WaveSide | undefined): Stroke {
  if (field === "side") return setStrokeTune(stroke, "waveSide", value === "left" ? "left" : "right");
  const key = tuneKey(field);
  const base = stroke.patternSizePct;
  const next: Stroke = { ...stroke };
  delete next.patternSizePct;
  for (const item of patternFields(stroke.pattern)) {
    if (item === "side" || item === field) continue;
    const itemKey = tuneKey(item);
    const current = stroke[itemKey];
    if (typeof current === "number") next[itemKey] = current as never;
    else if (base !== undefined && base !== 100) next[itemKey] = base as never;
  }
  const shown = typeof value === "number" && Number.isFinite(value) ? value : 100;
  if (shown === 100) delete next[key];
  else next[key] = shown as never;
  if (stroke.waveSide) next.waveSide = stroke.waveSide;
  return next;
}

/** Sets one pattern knob on a segment. A matching line value is not copied onto it. */
export function editSegmentTune(line: LineMark, index: number, field: TuneField, value: number | WaveSide | undefined): LineMark {
  const folded = foldSegmentPatternSize(line, index);
  if (field === "side") return setSegmentTune(folded, index, "waveSide", value === "left" ? "left" : "right");
  const key = tuneKey(field);
  const shown = typeof value === "number" && Number.isFinite(value) ? value : 100;
  return writeSegment(folded, index, { [key]: shown === tunePercent(folded.stroke, field) ? undefined : shown });
}

/** Stores one pattern adjustment on a segment, or clears it when it matches the line. */
export function setSegmentTune<K extends keyof PatternTune>(
  line: LineMark,
  index: number,
  key: K,
  value: PatternTune[K] | undefined
): LineMark {
  const shown = shownTune(key, value);
  const inherited = shownTune(key, line.stroke[key]);
  return writeSegment(line, index, { [key]: shown === inherited ? undefined : shown });
}

/** Writes one adjustment on the line. 100 and the right-hand wave side are left out. */
export function setStrokeTune<K extends keyof PatternTune>(stroke: Stroke, key: K, value: PatternTune[K] | undefined): Stroke {
  const next = { ...stroke };
  const shown = shownTune(key, value);
  if (shown === defaultTune(key)) delete next[key];
  else next[key] = shown as Stroke[K];
  return next;
}

function foldSegmentPatternSize(line: LineMark, index: number): LineMark {
  const own = line.segments?.[index];
  if (own?.patternSizePct === undefined) return line;
  const pattern = own.pattern ?? line.stroke.pattern;
  let next = line;
  for (const item of patternFields(pattern)) {
    if (item === "side") continue;
    const key = tuneKey(item);
    if (typeof own[key] === "number") continue;
    const base = own.patternSizePct;
    if (base !== tunePercent(line.stroke, item)) next = writeSegment(next, index, { [key]: base });
  }
  return writeSegment(next, index, { patternSizePct: undefined });
}

function shownTune(key: keyof PatternTune, value: unknown): number | WaveSide {
  if (key === "waveSide") return value === "left" ? "left" : "right";
  return typeof value === "number" && Number.isFinite(value) ? value : 100;
}

function defaultTune(key: keyof PatternTune): number | WaveSide {
  return key === "waveSide" ? "right" : 100;
}

function writeSegment(line: LineMark, index: number, patch: Partial<Record<(typeof STYLE_KEYS)[number], string | number | undefined>>): LineMark {
  const count = Math.max(0, line.points.length - 1);
  if (index < 0 || index >= count) return line;
  const segments: (SegmentStyle | null)[] = Array.from({ length: count }, (_, i) => clone(line.segments?.[i]));
  const next: SegmentStyle = { ...(segments[index] ?? {}) };
  for (const key of STYLE_KEYS) {
    if (!(key in patch)) continue;
    const value = patch[key];
    if (value === undefined || value === "") delete next[key];
    else next[key] = value as never;
  }
  segments[index] = Object.keys(next).length > 0 ? next : null;
  const copy = { ...line };
  if (segments.some((entry) => entry)) copy.segments = segments;
  else delete copy.segments;
  return copy;
}

function clone(entry: SegmentStyle | null | undefined): SegmentStyle | null {
  if (!entry) return null;
  return { ...entry };
}
