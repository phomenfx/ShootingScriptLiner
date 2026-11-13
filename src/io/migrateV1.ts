/**
 * Version 1 to version 2. Every piece of version 1 knowledge lives in this
 * file: old field names, old locks, page fractions, and the quirks of even
 * older saves (project-level `labelBold`, `snapLineAngles`, `startCap`/`endCap`,
 * widths 1 to 3, `continuedFromLineId` segments).
 *
 * What changes:
 * - Page fractions become PDF points (needs the script's page sizes).
 * - Locks become overrides: a value is kept only when the mark has its own.
 * - Blank shot values stay inherited; non-blank ones become overrides in `own`.
 * - Single values become one-entry lists; the old camera pairs with the old lens.
 * - Saved order numbers, slugline strings and copied captions are dropped.
 */
import { DATA_REVISION } from "../model/defaults";
import { newId } from "../lib/ids";
import { splitSlugline } from "../lib/slugline";
import {
  DEFAULT_DATE_FORMAT,
  DEFAULT_FONT,
  DEFAULT_NOTE_COLOR,
  completeCaptionFields,
  defaultSettings,
} from "../model/defaults";
import { keyForText } from "../model/registry";
import type {
  CameraRow,
  ContCaption,
  Ending,
  LineMark,
  Mark,
  Point,
  Project,
  ProjectSettings,
  Scene,
  ScriptInfo,
  ScriptPage,
  Shot,
  ShotOwn,
  TextAlign,
  TextMark,
} from "../model/types";

type Raw = Record<string, unknown>;

/** Caption field IDs: version 1 name to version 2 name. */
export const V1_CAPTION_FIELD_IDS: Record<string, string> = {
  shotNumber: "shotNumber",
  shotType: "type",
  subject: "subject",
  additionalInfo: "additionalInfo",
  cameraSupport: "system",
  lens: "lens",
  audio: "audio",
  location: "location",
  scheduledDate: "date",
  notes: "notes",
  indicator: "indicator",
  timeOfDay: "time",
  camera: "camera",
  fps: "fps",
  sync: "sync",
};

/** Used when a mark's page has no known size. US Letter. */
export const FALLBACK_PAGE: ScriptPage = { widthPt: 612, heightPt: 792, rotation: 0 };

const V1_CAPS = ["none", "square", "circle", "diamond", "arrow", "arrowReversed", "butt", "slash"];
const V1_STROKES = [
  "dashed_2_2",
  "dashed_3_3",
  "dashed_4_4",
  "dashed_4_3_2_3",
  "dashed_4_3_16_3",
  "dashed_8_4_4_4",
  "dotted",
];

/* ---------- small readers ---------- */

function isRecord(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function trimmed(value: unknown): string {
  return str(value).trim();
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isAlign(value: unknown): value is TextAlign {
  return value === "left" || value === "center" || value === "right";
}

/** Points are kept to a thousandth, which is far below anything visible. */
export function roundPt(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return rounded === 0 ? 0 : rounded;
}

function setIf<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined) {
  if (value !== undefined) target[key] = value;
}

/* ---------- endings and strokes ---------- */

function capName(raw: string): string {
  switch (raw) {
    case "box":
      return "square";
    case "openArrow":
    case "closedArrow":
      return "arrow";
    case "openArrowReversed":
    case "closedArrowReversed":
      return "arrowReversed";
    case "slant":
      return "slash";
    default:
      return V1_CAPS.includes(raw) ? raw : "none";
  }
}

export function endingFromV1(raw: unknown, legacyCap?: unknown): Ending {
  if (isRecord(raw) && typeof raw.cap === "string") {
    const type = capName(raw.cap);
    let filled: boolean;
    if (typeof raw.filled === "boolean") filled = raw.filled;
    else if (raw.cap === "openArrow" || raw.cap === "openArrowReversed") filled = false;
    else filled = ["arrow", "arrowReversed", "square", "circle"].includes(type);
    return { type, sizePct: Number(raw.scalePercent) || 100, filled };
  }
  const type = typeof legacyCap === "string" ? capName(legacyCap) : "none";
  return {
    type,
    sizePct: 100,
    filled: ["arrow", "arrowReversed", "square", "circle"].includes(type),
  };
}

export function patternFromV1(raw: unknown): string {
  if (raw === "dashed") return "dashed_4_4";
  if (typeof raw === "string" && V1_STROKES.includes(raw)) return raw;
  return "straight";
}

function widthFromV1(style: Raw, fallback: number): number {
  if (typeof style.widthPt === "number") return style.widthPt;
  if (typeof style.width === "number") {
    const w = style.width;
    return w <= 3 ? ([1, 2, 3][w - 1] ?? w * 1.5) : w;
  }
  return fallback;
}

/* ---------- marks ---------- */

export type V1MarkContext = {
  /** Size of a 1-based page as displayed. */
  pageSize: (page: number) => ScriptPage;
  shotExists: (shotId: string) => boolean;
  /** Bold for marks that carry no `labelBold` of their own. */
  defaultBold: boolean;
  /** Project caption offsets, used to complete a half-set custom offset. */
  offsetAcrossPt: number;
  offsetAbovePt: number;
  /**
   * In a saved file an unlocked but empty caption shows the shot's caption, so
   * it becomes "follow". The live editor sets this so that an empty Custom
   * caption stays Custom while it is being typed.
   */
  keepEmptyCustom?: boolean;
};

function pointFromV1(raw: unknown, size: ScriptPage): Point | null {
  if (!isRecord(raw)) return null;
  const x = finite(raw.x);
  const y = finite(raw.y);
  if (x === undefined || y === undefined) return null;
  return { x: roundPt(x * size.widthPt), y: roundPt(y * size.heightPt) };
}

/** Returns null when the record cannot be read as a line. */
export function lineFromV1(raw: Raw, ctx: V1MarkContext): LineMark | null {
  if (!Array.isArray(raw.points) || raw.points.length < 2) return null;
  const page = Math.max(1, Math.floor(Number(raw.page) || 1));
  const size = ctx.pageSize(page);
  const points: Point[] = [];
  for (const p of raw.points) {
    const point = pointFromV1(p, size);
    if (!point) return null;
    points.push(point);
  }

  const style = isRecord(raw.style) ? raw.style : {};
  const shotId = typeof raw.shotId === "string" && ctx.shotExists(raw.shotId) ? raw.shotId : undefined;
  const locks = isRecord(raw.locks) ? raw.locks : {};
  const hadLink = typeof raw.shotId === "string" && raw.shotId !== "";
  const labelLocked = typeof locks.label === "boolean" ? locks.label : hadLink;
  const colorLocked = typeof locks.color === "boolean" ? locks.color : hadLink;
  const label = typeof raw.label === "string" ? raw.label : undefined;

  const line: LineMark = {
    id: typeof raw.id === "string" && raw.id ? raw.id : newId(),
    kind: "line",
    page,
    points,
    stroke: { pattern: patternFromV1(style.stroke), widthPt: widthFromV1(style, 2) },
    start: endingFromV1(style.start, style.startCap),
    end: endingFromV1(style.end, style.endCap),
    caption: {
      show: raw.showLabel !== false,
      font: str(raw.fontFamily) || DEFAULT_FONT,
      sizePt: Number(raw.fontSizePt) || 11,
      bold: typeof raw.labelBold === "boolean" ? raw.labelBold : ctx.defaultBold,
      italic: raw.labelItalic === true,
      underline: raw.labelUnderline === true,
      align: isAlign(raw.labelAlign) ? raw.labelAlign : "left",
    },
  };

  if (shotId) line.shotId = shotId;
  // A color lock only means something while the shot exists.
  if (!(shotId && colorLocked)) line.color = str(style.color) || "#FF0000";

  if (shotId) {
    if (!labelLocked && label !== undefined && (label !== "" || ctx.keepEmptyCustom)) {
      line.caption.text = label;
    }
  } else if (label) {
    line.caption.text = label;
  }

  const offsetX = finite(raw.labelOffsetXPt);
  const offsetY = finite(raw.labelOffsetYPt);
  if (offsetX !== undefined || offsetY !== undefined) {
    // Version 1 measured the caption offset upward; version 2 measures everything downward.
    line.caption.offset = {
      x: clamp(offsetX ?? ctx.offsetAcrossPt, -2000, 2000),
      y: 0 - clamp(offsetY ?? ctx.offsetAbovePt, -2000, 2000),
    };
  }
  const width = finite(raw.labelWidthPt);
  const minHeight = finite(raw.labelMinHeightPt);
  if (width !== undefined) line.caption.widthPt = clamp(width, 1, 4000);
  if (minHeight !== undefined) line.caption.minHeightPt = clamp(minHeight, 0, 4000);

  const cont: ContCaption = {};
  const contX = finite(raw.secondaryOffsetXPt);
  const contGap = finite(raw.secondaryGapPt);
  const contWidth = finite(raw.secondaryWidthPt);
  const contMinHeight = finite(raw.secondaryMinHeightPt);
  if (contX !== undefined) cont.offsetXPt = clamp(contX, -2000, 2000);
  if (contGap !== undefined) cont.gapPt = clamp(contGap, -2000, 2000);
  if (contWidth !== undefined) cont.widthPt = clamp(contWidth, 1, 4000);
  if (contMinHeight !== undefined) cont.minHeightPt = clamp(contMinHeight, 0, 4000);
  if (isAlign(raw.secondaryAlign)) cont.align = raw.secondaryAlign;
  if (Object.keys(cont).length > 0) line.contCaption = cont;

  let continuation = raw.marginContinuation;
  if (continuation !== "top" && continuation !== "bottom") {
    continuation = undefined;
    const fromLine = raw.continuedFromLineId;
    if (raw.continuesToNextPage && !fromLine) continuation = "bottom";
    else if (raw.continuedFromPrevPage && fromLine) continuation = "top";
  }
  if (continuation === "top" || continuation === "bottom") line.marginContinuation = continuation;

  return line;
}

export function textFromV1(raw: Raw, ctx: V1MarkContext): TextMark {
  const page = Math.max(1, Math.floor(Number(raw.page) || 1));
  const size = ctx.pageSize(page);
  const shotId = typeof raw.shotId === "string" && ctx.shotExists(raw.shotId) ? raw.shotId : undefined;
  const text = String(raw.text ?? "Note");
  const colorLocked = isRecord(raw.locks) && raw.locks.color === true;

  const note: TextMark = {
    id: typeof raw.id === "string" && raw.id ? raw.id : newId(),
    kind: "text",
    page,
    x: roundPt((finite(raw.x) ?? 0.5) * size.widthPt),
    y: roundPt((finite(raw.y) ?? 0.5) * size.heightPt),
    show: raw.showText !== false,
    style: {
      font: str(raw.fontFamily) || DEFAULT_FONT,
      sizePt: finite(raw.fontSize) ?? 11,
      bold:
        typeof raw.labelBold === "boolean"
          ? raw.labelBold
          : typeof raw.bold === "boolean"
            ? raw.bold
            : ctx.defaultBold,
      italic: raw.labelItalic === true,
      underline: raw.labelUnderline === true,
      align: isAlign(raw.align) ? raw.align : "left",
    },
  };

  if (shotId) {
    note.shotId = shotId;
    // A linked note with no text of its own showed the shot's caption.
    if (raw.followShot !== true && (text.trim() !== "" || ctx.keepEmptyCustom)) note.text = text;
    if (!colorLocked) note.color = str(raw.color) || DEFAULT_NOTE_COLOR;
  } else {
    note.text = text;
    note.color = str(raw.color) || DEFAULT_NOTE_COLOR;
  }

  const width = finite(raw.widthPt);
  const minHeight = finite(raw.minHeightPt);
  if (width !== undefined) note.widthPt = clamp(width, 1, 4000);
  if (minHeight !== undefined) note.minHeightPt = clamp(minHeight, 0, 4000);
  return note;
}

/** Converts version 1 marks. Old continuation segments are dropped; unreadable marks are reported. */
export function marksFromV1(
  rawMarks: unknown[],
  ctx: V1MarkContext
): { marks: Mark[]; notices: string[] } {
  const marks: Mark[] = [];
  const notices: string[] = [];
  rawMarks.forEach((raw, index) => {
    if (!isRecord(raw)) {
      notices.push(`Skipped mark ${index + 1}: not a record.`);
      return;
    }
    if (raw.kind === "line") {
      if (raw.continuedFromLineId) return;
      const line = lineFromV1(raw, ctx);
      if (line) marks.push(line);
      else notices.push(`Skipped line ${index + 1} on page ${Number(raw.page) || "?"}: its points are missing.`);
      return;
    }
    if (raw.kind === "text") {
      marks.push(textFromV1(raw, ctx));
      return;
    }
    notices.push(`Skipped mark ${index + 1}: unknown kind "${String(raw.kind)}".`);
  });
  return { marks, notices };
}

/* ---------- scenes and shots ---------- */

function oneEntry(value: unknown): string[] {
  const text = trimmed(value);
  return text ? [text] : [];
}

function byOrder(list: unknown[]): Raw[] {
  return list
    .filter(isRecord)
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (Number(a.item.order) || 0) - (Number(b.item.order) || 0) || a.index - b.index)
    .map(({ item }) => item);
}

export function syncKeyFromV1(value: unknown): string {
  return keyForText("sync", str(value));
}

export function shotFromV1(raw: Raw, scene: Pick<Scene, "defaults">): Shot {
  const shot: Shot = {
    id: typeof raw.id === "string" && raw.id ? raw.id : newId(),
    color: str(raw.color) || "#FF0000",
    visible: raw.visible !== false,
    status: "planned",
    priority: "nice",
  };
  setIf(shot, "type", str(raw.shotType) || undefined);
  setIf(shot, "subject", str(raw.subject) || undefined);
  setIf(shot, "additionalInfo", str(raw.slug) || undefined);
  setIf(shot, "notes", str(raw.notes) || undefined);

  const own: ShotOwn = {};
  setIf(own, "indicator", trimmed(raw.indicator) || undefined);
  setIf(own, "location", trimmed(raw.location) || undefined);
  setIf(own, "time", trimmed(raw.timeOfDay) || undefined);
  if (trimmed(raw.cameraSupport)) own.system = oneEntry(raw.cameraSupport);
  if (trimmed(raw.audioSource)) own.audio = oneEntry(raw.audioSource);
  const camera = trimmed(raw.camera);
  const lens = trimmed(raw.lens);
  if (camera || lens) {
    // The lock covers the whole camera list, so the half the shot left blank
    // is filled from the scene as it stands now.
    const sceneCamera = scene.defaults.cameras[0];
    own.cameras = [
      {
        name: camera || sceneCamera?.name || "",
        lenses: lens ? [lens] : [...(sceneCamera?.lenses ?? [])],
      },
    ];
  }
  setIf(own, "fps", trimmed(raw.fps) || undefined);
  setIf(own, "sync", syncKeyFromV1(raw.sync) || undefined);
  setIf(own, "date", trimmed(raw.scheduledDate) || undefined);
  if (Object.keys(own).length > 0) shot.own = own;

  if (isRecord(raw.lineLabelInclude)) {
    const print: Record<string, boolean> = {};
    for (const [v1Id, value] of Object.entries(raw.lineLabelInclude)) {
      const id = V1_CAPTION_FIELD_IDS[v1Id];
      if (id && typeof value === "boolean") print[id] = value;
    }
    if (Object.keys(print).length > 0) shot.print = print;
  }
  return shot;
}

export function camerasFromV1(camera: unknown, lens: unknown): CameraRow[] {
  const name = trimmed(camera);
  const lenses = oneEntry(lens);
  return name || lenses.length > 0 ? [{ name, lenses }] : [];
}

export function sceneFromV1(raw: Raw): Scene {
  let indicator = trimmed(raw.indicator);
  let location = trimmed(raw.location);
  let time = trimmed(raw.timeOfDay);
  const slugline = trimmed(raw.slugline);
  if (!indicator && !location && !time && slugline) {
    const parts = splitSlugline(slugline);
    indicator = parts.indicator;
    location = parts.location;
    time = parts.timeOfDay;
  }

  const scene: Scene = {
    id: typeof raw.id === "string" && raw.id ? raw.id : newId(),
    visible: raw.visible !== false,
    heading: { indicator, location, time },
    defaults: {
      movement: [],
      system: oneEntry(raw.cameraSupport),
      cameras: camerasFromV1(raw.camera, raw.lens),
      audio: oneEntry(raw.audioSource),
    },
    shots: [],
  };
  setIf(scene.defaults, "fps", trimmed(raw.fps) || undefined);
  setIf(scene.defaults, "sync", syncKeyFromV1(raw.sync) || undefined);
  setIf(scene.defaults, "date", trimmed(raw.scheduledDate) || undefined);
  scene.shots = byOrder(Array.isArray(raw.shots) ? raw.shots : []).map((shot) =>
    shotFromV1(shot, scene)
  );
  return scene;
}

/* ---------- project ---------- */

function settingsFromV1(raw: Raw): ProjectSettings {
  const settings = defaultSettings();
  const defaultLine = isRecord(raw.defaultLine) ? raw.defaultLine : {};

  settings.general.shotIdStyle = raw.labelMode === "decimal" ? "decimal" : "letter";
  settings.general.additionalInfoStyle = raw.additionalInfoStyle === "hyphen" ? "hyphen" : "parens";
  settings.general.newShotColor = str(raw.defaultShotColor) || "#FF0000";

  if (Array.isArray(raw.lineLabelFields)) {
    settings.captions.fields = completeCaptionFields(
      raw.lineLabelFields.filter(isRecord).map((field) => ({
        id: V1_CAPTION_FIELD_IDS[str(field.id)],
        print: field.enabled === true,
      })),
      settings.general.additionalInfoStyle
    );
  } else if (settings.general.additionalInfoStyle === "hyphen") {
    settings.captions.fields = settings.captions.fields.map((field) =>
      field.id === "additionalInfo" ? { ...field, divider: "spacedHyphen" } : field
    );
  }
  const offset = (value: unknown, fallback: number) => clamp(finite(value) ?? fallback, 0, 48);
  // Caption offsets may be negative: across to sit left of the line, above to sit below its start.
  settings.captions.offsetAcrossPt = clamp(finite(raw.labelOffsetXPt) ?? 3, -400, 400);
  settings.captions.offsetAbovePt = clamp(finite(raw.labelOffsetYPt) ?? 4, -200, 200);
  settings.captions.contGapPt = offset(raw.labelSecondaryGapPt, 4);
  settings.captions.dateFormat = trimmed(raw.scheduledDateFormat)
    ? str(raw.scheduledDateFormat)
    : DEFAULT_DATE_FORMAT;

  // Bold used to be a project-level switch before it moved into the line defaults.
  const bold =
    typeof defaultLine.labelBold === "boolean"
      ? defaultLine.labelBold
      : typeof raw.labelBold === "boolean"
        ? raw.labelBold
        : true;
  const textStyle = {
    font: str(defaultLine.fontFamily) || DEFAULT_FONT,
    sizePt: finite(defaultLine.fontSizePt) ?? 11,
    bold,
    italic: false,
    underline: false,
    align: "left" as const,
  };
  settings.markDefaults.line = {
    stroke: {
      pattern: patternFromV1(defaultLine.stroke ?? "solid"),
      widthPt: finite(defaultLine.widthPt) ?? 2,
    },
    start: endingFromV1(defaultLine.start, defaultLine.startCap),
    end: isRecord(defaultLine.end) || defaultLine.endCap !== undefined
      ? endingFromV1(defaultLine.end, defaultLine.endCap)
      : { type: "arrow", sizePct: 100, filled: true },
    caption: { ...textStyle },
  };
  // Version 1 had one font setting for captions and notes alike.
  settings.markDefaults.text = { color: DEFAULT_NOTE_COLOR, style: { ...textStyle } };

  const snap = finite(raw.snapAngleDegrees);
  settings.drawing.angleSnapDegrees = snap ?? (raw.snapLineAngles === false ? 0 : 15);
  // Version 1 always showed page 1 by itself in book spread.
  settings.drawing.firstPageAlone = true;
  settings.drawing.newLineCopiesPrevious = raw.inheritLineFromPrevious === true;
  return settings;
}

export function v1MarkContext(project: Project, keepEmptyCustom = false): V1MarkContext {
  const pages = project.script?.pages ?? [];
  const shotIds = new Set(project.scenes.flatMap((scene) => scene.shots.map((shot) => shot.id)));
  return {
    pageSize: (page) => pages[page - 1] ?? pages[0] ?? FALLBACK_PAGE,
    shotExists: (id) => shotIds.has(id),
    defaultBold: project.settings.markDefaults.line.caption.bold,
    offsetAcrossPt: project.settings.captions.offsetAcrossPt,
    offsetAbovePt: project.settings.captions.offsetAbovePt,
    keepEmptyCustom,
  };
}

/**
 * Places version 1 marks that were waiting for page sizes. Does nothing unless
 * the project has such marks and its script pages are known.
 */
export function placeUnplacedV1Marks(project: Project): { project: Project; notices: string[] } {
  if (!project.unplacedV1Marks?.length || !project.script?.pages.length) {
    return { project, notices: [] };
  }
  const { marks, notices } = marksFromV1(project.unplacedV1Marks, v1MarkContext(project));
  const { unplacedV1Marks: _placed, ...rest } = project;
  return { project: { ...rest, marks: [...project.marks, ...marks] }, notices };
}

export type MigrationResult = { project: Project; notices: string[] };

/**
 * Converts a parsed version 1 save. Pass the script's details when the PDF is
 * at hand; without page sizes the marks wait in `unplacedV1Marks`.
 */
export function migrateV1(raw: unknown, script?: ScriptInfo): MigrationResult {
  if (!isRecord(raw) || raw.version !== 1) {
    throw new Error("Not a version 1 project");
  }
  const notices: string[] = [];
  const fileName = str(raw.scriptFileName) || script?.fileName || "";

  let project: Project = {
    version: 2,
    dataRevision: DATA_REVISION,
    name: str(raw.name) || "Untitled",
    settings: settingsFromV1(raw),
    scenes: byOrder(Array.isArray(raw.scenes) ? raw.scenes : []).map(sceneFromV1),
    marks: [],
    assets: [],
  };
  if (script) project.script = { ...script, fileName: fileName || script.fileName };
  else if (fileName) project.script = { fileName, pageCount: 0, pages: [], fingerprint: "" };

  const rawMarks = Array.isArray(raw.annotations) ? raw.annotations : [];
  if (rawMarks.length > 0) {
    project.unplacedV1Marks = rawMarks;
    const placed = placeUnplacedV1Marks(project);
    project = placed.project;
    notices.push(...placed.notices);
    if (project.unplacedV1Marks) {
      notices.push(
        "This older project was opened without its script PDF. Import the script to show its lines and notes."
      );
    }
  }
  return { project, notices };
}
