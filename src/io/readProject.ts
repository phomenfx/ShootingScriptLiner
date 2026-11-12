/**
 * Reads a project file of any supported version.
 *
 * Version 2 is read record by record. A broken or unknown scene, shot or mark
 * is skipped with a notice that names it, instead of failing the whole file.
 * Unknown fields are ignored. Unknown choice keys are kept as they are.
 * Version 1 files go through `migrateV1` first.
 */
import {
  DEFAULT_NOTE_COLOR,
  completeCaptionFields,
  defaultSettings,
} from "../model/defaults";
import type {
  Asset,
  CameraRow,
  Caption,
  ContCaption,
  Ending,
  ImageMark,
  LineMark,
  ListEntry,
  Mark,
  MarkOwn,
  Outline,
  PatternTune,
  Point,
  Project,
  ProjectSettings,
  Scene,
  ScriptInfo,
  ScriptPage,
  ShapeMark,
  Shot,
  ShotOwn,
  Stroke,
  TextAlign,
  TextMark,
  TextStyle,
} from "../model/types";
import { migrateV1 } from "./migrateV1";

type Raw = Record<string, unknown>;

export type ReadResult = { project: Project; notices: string[] };

export class ProjectReadError extends Error {}

/* ---------- small readers ---------- */

function isRecord(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string");
}

function align(value: unknown): TextAlign | undefined {
  return value === "left" || value === "center" || value === "right" ? value : undefined;
}

class Skip extends Error {}

function need<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Skip(what);
  return value;
}

/* ---------- pieces ---------- */

function readPoint(raw: unknown): Point | undefined {
  if (!isRecord(raw)) return undefined;
  const x = num(raw.x);
  const y = num(raw.y);
  return x === undefined || y === undefined ? undefined : { x, y };
}

function readOutline(raw: unknown): Outline | undefined {
  if (!isRecord(raw)) return undefined;
  const widthPt = num(raw.widthPt);
  const color = nonEmpty(raw.color);
  if (widthPt === undefined || !color) return undefined;
  return { color, widthPt: Math.max(0.25, Math.min(6, widthPt)) };
}

function readEnding(raw: unknown, fallback: Ending): Ending {
  if (!isRecord(raw)) return { ...fallback };
  return {
    type: nonEmpty(raw.type) ?? fallback.type,
    sizePct: num(raw.sizePct) ?? fallback.sizePct,
    filled: bool(raw.filled, fallback.filled),
  };
}

function readStroke(raw: unknown, fallback: Stroke): Stroke {
  if (!isRecord(raw)) return { ...fallback };
  return {
    pattern: nonEmpty(raw.pattern) ?? fallback.pattern,
    widthPt: num(raw.widthPt) ?? fallback.widthPt,
    ...readTune(raw),
  };
}

function readTune(raw: Raw): PatternTune {
  const tune: PatternTune = {};
  for (const key of ["patternSizePct", "lengthPct", "gapPct", "amplitudePct"] as const) {
    const value = num(raw[key]);
    if (value !== undefined) tune[key] = value;
  }
  if (raw.waveSide === "left" || raw.waveSide === "right") tune.waveSide = raw.waveSide;
  return tune;
}

function readTextStyle(raw: unknown, fallback: TextStyle): TextStyle {
  const r = isRecord(raw) ? raw : {};
  return {
    font: nonEmpty(r.font) ?? fallback.font,
    sizePt: num(r.sizePt) ?? fallback.sizePt,
    bold: bool(r.bold, fallback.bold),
    italic: bool(r.italic, fallback.italic),
    underline: bool(r.underline, fallback.underline),
    align: align(r.align) ?? fallback.align,
  };
}

function readMarkOwn(value: unknown): MarkOwn | undefined {
  if (!isRecord(value)) return undefined;
  const own: MarkOwn = {};
  for (const key of ["type", "angle", "subject", "additionalInfo", "notes", "setup", "indicator", "location", "time", "fps", "sync", "date"] as const) {
    if (typeof value[key] === "string") own[key] = value[key];
  }
  for (const key of ["cast", "tags", "movement", "audio"] as const) {
    const list = stringList(value[key]);
    if (list) own[key] = list;
  }
  const cameras = readCameras(value.cameras);
  if (cameras) own.cameras = cameras;
  return Object.keys(own).length > 0 ? own : undefined;
}

function readCameras(value: unknown): CameraRow[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(isRecord).map((row) => ({
    name: optString(row.name) ?? "",
    lenses: stringList(row.lenses) ?? [],
  }));
}

function readListEntries(value: unknown): ListEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: ListEntry[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const key = nonEmpty(raw.key);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const entry: ListEntry = { key, label: optString(raw.label) ?? key };
    const icon = nonEmpty(raw.icon);
    const color = nonEmpty(raw.color);
    if (icon) entry.icon = icon;
    if (color) entry.color = color;
    entries.push(entry);
  }
  return entries;
}

/* ---------- scenes and shots ---------- */

function readOwn(raw: unknown): ShotOwn | undefined {
  if (!isRecord(raw)) return undefined;
  const own: ShotOwn = {};
  for (const key of ["indicator", "location", "time", "fps", "sync", "date"] as const) {
    const value = optString(raw[key]);
    if (value !== undefined) own[key] = value;
  }
  for (const key of ["movement", "audio"] as const) {
    const value = stringList(raw[key]);
    if (value !== undefined) own[key] = value;
  }
  const cameras = readCameras(raw.cameras);
  if (cameras !== undefined) own.cameras = cameras;
  return Object.keys(own).length > 0 ? own : undefined;
}

function readShot(raw: unknown, settings: ProjectSettings): Shot {
  if (!isRecord(raw)) throw new Skip("it is not a record");
  const shot: Shot = {
    id: need(nonEmpty(raw.id), "it has no id"),
    color: nonEmpty(raw.color) ?? settings.general.newShotColor,
    visible: bool(raw.visible, true),
    status: nonEmpty(raw.status) ?? "planned",
    priority: nonEmpty(raw.priority) ?? "nice",
  };
  for (const key of ["type", "angle", "subject", "additionalInfo", "setup", "notes"] as const) {
    const value = nonEmpty(raw[key]);
    if (value !== undefined) shot[key] = value;
  }
  for (const key of ["cast", "tags"] as const) {
    const value = stringList(raw[key]);
    if (value?.length) shot[key] = value;
  }
  const minutes = num(raw.estimatedMinutes);
  if (minutes !== undefined) shot.estimatedMinutes = minutes;
  if (isRecord(raw.print)) {
    const print: Record<string, boolean> = {};
    for (const [id, value] of Object.entries(raw.print)) {
      if (typeof value === "boolean") print[id] = value;
    }
    if (Object.keys(print).length > 0) shot.print = print;
  }
  const own = readOwn(raw.own);
  if (own) shot.own = own;
  return shot;
}

function readScene(raw: unknown, settings: ProjectSettings, notices: string[], number: number): Scene {
  if (!isRecord(raw)) throw new Skip("it is not a record");
  const heading = isRecord(raw.heading) ? raw.heading : {};
  const defaults = isRecord(raw.defaults) ? raw.defaults : {};
  const scene: Scene = {
    id: need(nonEmpty(raw.id), "it has no id"),
    visible: bool(raw.visible, true),
    heading: {
      indicator: optString(heading.indicator) ?? "",
      location: optString(heading.location) ?? "",
      time: optString(heading.time) ?? "",
    },
    defaults: {
      movement: stringList(defaults.movement) ?? [],
      cameras: readCameras(defaults.cameras) ?? [],
      audio: stringList(defaults.audio) ?? [],
    },
    shots: [],
  };
  for (const key of ["fps", "sync", "date"] as const) {
    const value = nonEmpty(defaults[key]);
    if (value !== undefined) scene.defaults[key] = value;
  }
  (Array.isArray(raw.shots) ? raw.shots : []).forEach((rawShot, index) => {
    try {
      scene.shots.push(readShot(rawShot, settings));
    } catch (error) {
      if (!(error instanceof Skip)) throw error;
      notices.push(`Skipped shot ${index + 1} of scene ${number}: ${error.message}.`);
    }
  });
  return scene;
}

/* ---------- marks ---------- */

type MarkContext = { settings: ProjectSettings; shotIds: Set<string>; assetIds: Set<string> };

function readPage(raw: Raw): number {
  const page = num(raw.page);
  if (page === undefined || page < 1) throw new Skip("it has no page number");
  return Math.floor(page);
}

function readCaption(raw: unknown, fallback: TextStyle): Caption {
  const r = isRecord(raw) ? raw : {};
  const caption: Caption = { show: bool(r.show, true), ...readTextStyle(r, fallback) };
  const text = optString(r.text);
  const offset = readPoint(r.offset);
  const widthPt = num(r.widthPt);
  const minHeightPt = num(r.minHeightPt);
  const outline = readOutline(r.outline);
  if (text !== undefined) caption.text = text;
  if (offset) caption.offset = offset;
  if (widthPt !== undefined) caption.widthPt = widthPt;
  if (minHeightPt !== undefined) caption.minHeightPt = minHeightPt;
  if (outline) caption.outline = outline;
  return caption;
}

function readContCaption(raw: unknown): ContCaption | undefined {
  if (!isRecord(raw)) return undefined;
  const cont: ContCaption = {};
  for (const key of ["offsetXPt", "gapPt", "widthPt", "minHeightPt"] as const) {
    const value = num(raw[key]);
    if (value !== undefined) cont[key] = value;
  }
  const a = align(raw.align);
  if (a) cont.align = a;
  return Object.keys(cont).length > 0 ? cont : undefined;
}

/** A link to a shot that is gone is dropped. The caller makes sure the mark still has a color. */
function readShotLink(raw: Raw, ctx: MarkContext, notes: string[], what: string): string | undefined {
  const shotId = nonEmpty(raw.shotId);
  if (!shotId) return undefined;
  if (ctx.shotIds.has(shotId)) return shotId;
  notes.push(`${what} was linked to a shot that no longer exists, so it was unlinked.`);
  return undefined;
}

function readLine(raw: Raw, ctx: MarkContext, notes: string[], what: string): LineMark {
  const defaults = ctx.settings.markDefaults.line;
  const points = (Array.isArray(raw.points) ? raw.points : []).map(readPoint);
  if (points.length < 2 || points.some((p) => !p)) throw new Skip("its points are missing or broken");
  const line: LineMark = {
    id: need(nonEmpty(raw.id), "it has no id"),
    kind: "line",
    page: readPage(raw),
    points: points as Point[],
    stroke: readStroke(raw.stroke, defaults.stroke),
    start: readEnding(raw.start, defaults.start),
    end: readEnding(raw.end, defaults.end),
    caption: readCaption(raw.caption, defaults.caption),
  };
  if (isRecord(raw.mid)) {
    const mid = readEnding(raw.mid, { type: "none", sizePct: 100, filled: true });
    if (mid.type !== "none") line.mid = mid;
  }
  const shotId = readShotLink(raw, ctx, notes, what);
  const color = nonEmpty(raw.color);
  if (shotId) {
    line.shotId = shotId;
    const own = readMarkOwn(raw.own);
    if (own) line.own = own;
  }
  if (color) line.color = color;
  else if (!shotId) line.color = ctx.settings.general.newShotColor;
  if (Array.isArray(raw.segments)) {
    line.segments = raw.segments.slice(0, line.points.length - 1).map((segment) => {
      if (!isRecord(segment)) return null;
      const pattern = nonEmpty(segment.pattern);
      const widthPt = num(segment.widthPt);
      const style = { ...readTune(segment), ...(pattern ? { pattern } : {}), ...(widthPt !== undefined ? { widthPt } : {}) };
      return Object.keys(style).length > 0 ? style : null;
    });
  }
  const outline = readOutline(raw.outline);
  const cont = readContCaption(raw.contCaption);
  if (outline) line.outline = outline;
  if (cont) line.contCaption = cont;
  if (raw.marginContinuation === "top" || raw.marginContinuation === "bottom") {
    line.marginContinuation = raw.marginContinuation;
  }
  return line;
}

function readText(raw: Raw, ctx: MarkContext, notes: string[], what: string): TextMark {
  const defaults = ctx.settings.markDefaults.text;
  const note: TextMark = {
    id: need(nonEmpty(raw.id), "it has no id"),
    kind: "text",
    page: readPage(raw),
    x: need(num(raw.x), "it has no position"),
    y: need(num(raw.y), "it has no position"),
    show: bool(raw.show, true),
    style: readTextStyle(raw.style, defaults.style),
  };
  const shotId = readShotLink(raw, ctx, notes, what);
  const text = optString(raw.text);
  const color = nonEmpty(raw.color);
  if (shotId) {
    note.shotId = shotId;
    const own = readMarkOwn(raw.own);
    if (own) note.own = own;
  }
  if (text !== undefined) note.text = text;
  else if (!shotId) note.text = "";
  if (color) note.color = color;
  else if (!shotId) note.color = defaults.color || DEFAULT_NOTE_COLOR;
  const widthPt = num(raw.widthPt);
  const minHeightPt = num(raw.minHeightPt);
  const outline = readOutline(raw.outline);
  if (widthPt !== undefined) note.widthPt = widthPt;
  if (minHeightPt !== undefined) note.minHeightPt = minHeightPt;
  if (outline) note.outline = outline;
  return note;
}

function readShape(raw: Raw, ctx: MarkContext, notes: string[], what: string): ShapeMark {
  const shape: ShapeMark = {
    id: need(nonEmpty(raw.id), "it has no id"),
    kind: "shape",
    page: readPage(raw),
    shape: need(nonEmpty(raw.shape), "it has no shape type"),
    x: need(num(raw.x), "it has no position"),
    y: need(num(raw.y), "it has no position"),
    widthPt: need(num(raw.widthPt), "it has no size"),
    heightPt: need(num(raw.heightPt), "it has no size"),
    rotation: num(raw.rotation) ?? 0,
  };
  const shotId = readShotLink(raw, ctx, notes, what);
  const color = nonEmpty(raw.color);
  if (shotId) shape.shotId = shotId;
  if (color) shape.color = color;
  else if (!shotId) shape.color = ctx.settings.general.newShotColor;
  for (const key of ["sides", "points", "innerDepthPct"] as const) {
    const value = num(raw[key]);
    if (value !== undefined) shape[key] = value;
  }
  const stamp = nonEmpty(raw.stamp);
  if (stamp) shape.stamp = stamp;
  if (isRecord(raw.stroke)) shape.stroke = readStroke(raw.stroke, { pattern: "straight", widthPt: 2 });
  if (isRecord(raw.fill)) {
    shape.fill = { opacityPct: num(raw.fill.opacityPct) ?? 100 };
    const fillColor = nonEmpty(raw.fill.color);
    if (fillColor) shape.fill.color = fillColor;
  }
  const outline = readOutline(raw.outline);
  if (outline) shape.outline = outline;
  return shape;
}

function readImage(raw: Raw, ctx: MarkContext): ImageMark {
  const assetId = need(nonEmpty(raw.assetId), "it has no image file");
  if (!ctx.assetIds.has(assetId)) throw new Skip("its image file is not in the project");
  return {
    id: need(nonEmpty(raw.id), "it has no id"),
    kind: "image",
    page: readPage(raw),
    x: need(num(raw.x), "it has no position"),
    y: need(num(raw.y), "it has no position"),
    widthPt: need(num(raw.widthPt), "it has no size"),
    assetId,
  };
}

function readMark(raw: unknown, ctx: MarkContext, notes: string[], what: string): Mark {
  if (!isRecord(raw)) throw new Skip("it is not a record");
  switch (raw.kind) {
    case "line":
      return readLine(raw, ctx, notes, what);
    case "text":
      return readText(raw, ctx, notes, what);
    case "shape":
      return readShape(raw, ctx, notes, what);
    case "image":
      return readImage(raw, ctx);
    default:
      throw new Skip(`its kind "${String(raw.kind)}" is not known to this version of the app`);
  }
}

/* ---------- settings, script, assets ---------- */

function readSettings(raw: unknown): ProjectSettings {
  const settings = defaultSettings();
  if (!isRecord(raw)) return settings;

  const general = isRecord(raw.general) ? raw.general : {};
  if (general.shotIdStyle === "decimal") settings.general.shotIdStyle = "decimal";
  if (general.additionalInfoStyle === "hyphen") settings.general.additionalInfoStyle = "hyphen";
  settings.general.newShotColor = nonEmpty(general.newShotColor) ?? settings.general.newShotColor;
  settings.general.newShotPriority =
    nonEmpty(general.newShotPriority) ?? settings.general.newShotPriority;

  const captions = isRecord(raw.captions) ? raw.captions : {};
  settings.captions.fields = completeCaptionFields(captions.fields, settings.general.additionalInfoStyle);
  for (const key of ["offsetAcrossPt", "offsetAbovePt", "contGapPt"] as const) {
    settings.captions[key] = num(captions[key]) ?? settings.captions[key];
  }
  settings.captions.dateFormat = nonEmpty(captions.dateFormat) ?? settings.captions.dateFormat;

  const marks = isRecord(raw.markDefaults) ? raw.markDefaults : {};
  if (isRecord(marks.line)) {
    const d = settings.markDefaults.line;
    settings.markDefaults.line = {
      stroke: readStroke(marks.line.stroke, d.stroke),
      start: readEnding(marks.line.start, d.start),
      end: readEnding(marks.line.end, d.end),
      caption: readTextStyle(marks.line.caption, d.caption),
    };
    const outline = readOutline(marks.line.outline);
    const captionOutline = readOutline(marks.line.captionOutline);
    if (outline) settings.markDefaults.line.outline = outline;
    if (captionOutline) settings.markDefaults.line.captionOutline = captionOutline;
  }
  if (isRecord(marks.shape)) {
    const d = settings.markDefaults.shape;
    settings.markDefaults.shape = { shape: nonEmpty(marks.shape.shape) ?? d.shape };
    if (isRecord(marks.shape.stroke)) {
      settings.markDefaults.shape.stroke = readStroke(marks.shape.stroke, {
        pattern: "straight",
        widthPt: 2,
      });
    }
    if (isRecord(marks.shape.fill)) {
      settings.markDefaults.shape.fill = { opacityPct: num(marks.shape.fill.opacityPct) ?? 100 };
    }
    const outline = readOutline(marks.shape.outline);
    if (outline) settings.markDefaults.shape.outline = outline;
  }
  if (isRecord(marks.text)) {
    const d = settings.markDefaults.text;
    settings.markDefaults.text = {
      color: nonEmpty(marks.text.color) ?? d.color,
      style: readTextStyle(marks.text.style, d.style),
    };
    const outline = readOutline(marks.text.outline);
    if (outline) settings.markDefaults.text.outline = outline;
  }

  const drawing = isRecord(raw.drawing) ? raw.drawing : {};
  settings.drawing = {
    angleSnapDegrees: num(drawing.angleSnapDegrees) ?? settings.drawing.angleSnapDegrees,
    firstPageAlone: bool(drawing.firstPageAlone, settings.drawing.firstPageAlone),
    newLineCopiesPrevious: bool(drawing.newLineCopiesPrevious, false),
  };

  if (isRecord(raw.lists)) {
    const lists: ProjectSettings["lists"] = {};
    for (const [name, entries] of Object.entries(raw.lists)) lists[name] = readListEntries(entries);
    if (!lists.tags) lists.tags = settings.lists.tags ?? [];
    settings.lists = lists;
  }

  if (isRecord(raw.importMapping)) {
    const mapping: Record<string, string> = {};
    for (const [header, field] of Object.entries(raw.importMapping)) {
      if (typeof field === "string") mapping[header] = field;
    }
    settings.importMapping = mapping;
  }
  return settings;
}

function readScript(raw: unknown): ScriptInfo | undefined {
  if (!isRecord(raw)) return undefined;
  const fileName = nonEmpty(raw.fileName);
  if (!fileName) return undefined;
  const pages: ScriptPage[] = (Array.isArray(raw.pages) ? raw.pages : [])
    .filter(isRecord)
    .map((page) => ({
      widthPt: num(page.widthPt) ?? 612,
      heightPt: num(page.heightPt) ?? 792,
      rotation: num(page.rotation) ?? 0,
    }));
  return {
    fileName,
    pageCount: num(raw.pageCount) ?? pages.length,
    pages,
    fingerprint: optString(raw.fingerprint) ?? "",
  };
}

function readAssets(raw: unknown, notices: string[]): Asset[] {
  const assets: Asset[] = [];
  (Array.isArray(raw) ? raw : []).forEach((item, index) => {
    if (
      isRecord(item) &&
      nonEmpty(item.id) &&
      (item.type === "image/jpeg" || item.type === "image/png")
    ) {
      assets.push({
        id: item.id as string,
        name: optString(item.name) ?? "",
        type: item.type,
        widthPx: num(item.widthPx) ?? 0,
        heightPx: num(item.heightPx) ?? 0,
      });
    } else {
      notices.push(`Skipped image file ${index + 1}: its record is broken.`);
    }
  });
  return assets;
}

/* ---------- entry points ---------- */

function describeMark(raw: unknown, index: number): string {
  const kind = isRecord(raw) && typeof raw.kind === "string" ? raw.kind : "mark";
  const names: Record<string, string> = { line: "Line", text: "Note", shape: "Shape", image: "Image" };
  const page = isRecord(raw) && typeof raw.page === "number" ? ` on page ${raw.page}` : "";
  return `${names[kind] ?? "Mark"} ${index + 1}${page}`;
}

export function readV2(raw: unknown): ReadResult {
  if (!isRecord(raw) || raw.version !== 2) throw new ProjectReadError("Not a version 2 project");
  const notices: string[] = [];
  const settings = readSettings(raw.settings);

  const scenes: Scene[] = [];
  const seenIds = new Set<string>();
  (Array.isArray(raw.scenes) ? raw.scenes : []).forEach((rawScene, index) => {
    try {
      const scene = readScene(rawScene, settings, notices, index + 1);
      if (seenIds.has(scene.id)) throw new Skip("its id is used twice");
      seenIds.add(scene.id);
      scene.shots = scene.shots.filter((shot) => {
        if (!seenIds.has(shot.id)) return seenIds.add(shot.id), true;
        notices.push(`Skipped a shot of scene ${index + 1}: its id is used twice.`);
        return false;
      });
      scenes.push(scene);
    } catch (error) {
      if (!(error instanceof Skip)) throw error;
      notices.push(`Skipped scene ${index + 1}: ${error.message}.`);
    }
  });

  const assets = readAssets(raw.assets, notices);
  const ctx: MarkContext = {
    settings,
    shotIds: new Set(scenes.flatMap((scene) => scene.shots.map((shot) => shot.id))),
    assetIds: new Set(assets.map((asset) => asset.id)),
  };
  const marks: Mark[] = [];
  (Array.isArray(raw.marks) ? raw.marks : []).forEach((rawMark, index) => {
    const what = describeMark(rawMark, index);
    try {
      const mark = readMark(rawMark, ctx, notices, what);
      if (seenIds.has(mark.id)) throw new Skip("its id is used twice");
      seenIds.add(mark.id);
      marks.push(mark);
    } catch (error) {
      if (!(error instanceof Skip)) throw error;
      notices.push(`Skipped ${what.charAt(0).toLowerCase()}${what.slice(1)}: ${error.message}.`);
    }
  });

  const project: Project = {
    version: 2,
    name: nonEmpty(raw.name) ?? "Untitled",
    settings,
    scenes,
    marks,
    assets,
  };
  const savedAt = nonEmpty(raw.savedAt);
  const appVersion = nonEmpty(raw.appVersion);
  const script = readScript(raw.script);
  if (savedAt) project.savedAt = savedAt;
  if (appVersion) project.appVersion = appVersion;
  if (script) project.script = script;
  if (Array.isArray(raw.unplacedV1Marks) && raw.unplacedV1Marks.length > 0) {
    project.unplacedV1Marks = raw.unplacedV1Marks;
  }
  return { project, notices };
}

/**
 * Parses project JSON of any supported version. `script` describes the PDF
 * that came with the file, when there is one; version 1 files need its page
 * sizes to place their marks.
 */
export function readProjectJson(json: string, script?: ScriptInfo): ReadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new ProjectReadError("This file is not a project: it could not be read as JSON.");
  }
  if (!isRecord(raw)) throw new ProjectReadError("This file is not a project.");
  if (raw.version === 1) return migrateV1(raw, script);
  if (raw.version === 2) return readV2(raw);
  if (typeof raw.version === "number" && raw.version > 2) {
    throw new ProjectReadError(
      "This project was saved by a newer version of the app. Reload the page to update, then open it again."
    );
  }
  throw new ProjectReadError("Unsupported project version");
}
