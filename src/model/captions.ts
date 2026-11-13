/**
 * What a shot says about itself: the values it uses (its own or its scene's),
 * the text of each caption field, and the caption drawn on linked marks.
 */
import { formatExcelDate } from "../lib/dateFormat";
import type { FoundShot } from "./edits";
import { CAPTION_FIELDS, choiceLabel } from "./registry";
import { shotIdLabel } from "./shotList";
import type { CameraRow, CaptionDivider, CaptionField, MarkOwn, Project, Scene, Shot, ShotOwn } from "./types";

export type EffectiveShot = Required<Pick<ShotOwn, "indicator" | "location" | "time" | "movement" | "system" | "cameras" | "audio">> &
  Pick<ShotOwn, "fps" | "sync" | "date">;

/** Every inheritable value as the shot uses it: its override when unlocked, else the scene's. */
export function effectiveShot(scene: Scene, shot: Shot): EffectiveShot {
  const own = shot.own ?? {};
  const d = scene.defaults;
  return {
    indicator: own.indicator ?? scene.heading.indicator,
    location: own.location ?? scene.heading.location,
    time: own.time ?? scene.heading.time,
    movement: own.movement ?? d.movement,
    system: own.system ?? d.system ?? [],
    cameras: own.cameras ?? d.cameras,
    audio: own.audio ?? d.audio,
    fps: own.fps ?? d.fps,
    sync: own.sync ?? d.sync,
    date: own.date ?? d.date,
  };
}

export function cameraNames(cameras: CameraRow[]): string[] {
  return cameras.map((camera) => camera.name).filter(Boolean);
}

export function cameraLenses(cameras: CameraRow[]): string[] {
  return cameras.flatMap((camera) => camera.lenses);
}

/** Whether a field prints for this shot: its own checkbox when set, else the project setting. */
export function printsField(project: Project, shot: Shot, fieldId: string): boolean {
  const own = shot.print?.[fieldId];
  if (typeof own === "boolean") return own;
  const field = project.settings.captions.fields.find((f) => f.id === fieldId);
  return field?.print ?? CAPTION_FIELDS.find((f) => f.id === fieldId)?.print ?? false;
}

/**
 * Whether one camera row prints its camera name or its lenses. Each row has its
 * own checkbox, stored on the shot as "camera:0", "lens:0" and so on. A row with
 * no checkbox of its own follows the field's setting.
 */
export function cameraRowPrints(project: Project, shot: Shot, part: "camera" | "lens", index: number): boolean {
  const own = shot.print?.[`${part}:${index}`];
  return typeof own === "boolean" ? own : printsField(project, shot, part);
}

/** The shot after one camera row's checkbox changes. A value equal to the field's setting is not kept. */
export function withCameraRowPrint(project: Project, shot: Shot, part: "camera" | "lens", index: number, print: boolean): Shot {
  const key = `${part}:${index}`;
  const next = { ...shot.print };
  delete next[key];
  const follows = printsField(project, { ...shot, print: next }, part);
  if (print !== follows) next[key] = print;
  if (Object.keys(next).length === 0) {
    const { print: _removed, ...rest } = shot;
    return rest;
  }
  return { ...shot, print: next };
}

/** The shot's print checkboxes after one is changed. A value equal to the project setting is not kept. */
export function withPrintField(project: Project, shot: Shot, fieldId: string, print: boolean): Shot {
  const projectDefault =
    project.settings.captions.fields.find((f) => f.id === fieldId)?.print ??
    CAPTION_FIELDS.find((f) => f.id === fieldId)?.print ??
    false;
  const next = { ...shot.print };
  if (print === projectDefault) delete next[fieldId];
  else next[fieldId] = print;
  if (Object.keys(next).length === 0) {
    const { print: _removed, ...rest } = shot;
    return rest;
  }
  return { ...shot, print: next };
}

/** The text one caption field contributes for a shot. A mark's own value wins when that field is unlocked. */
export function captionFieldText(project: Project, found: FoundShot, fieldId: string, own?: MarkOwn): string {
  const { scene, shot, sceneIndex, shotIndex } = found;
  const lists = project.settings.lists;
  const e = effectiveShot(scene, shot);
  const list = (values: string[] | undefined) => (values ?? []).filter(Boolean).join(", ");
  const text = (markValue: string | undefined, shotValue: string | undefined) => (markValue !== undefined ? markValue : shotValue)?.trim() ?? "";
  switch (fieldId) {
    case "shotNumber":
      return shotIdLabel(sceneIndex, shotIndex, project.settings.general.shotIdStyle);
    case "type":
      return text(own?.type, shot.type);
    case "angle":
      return choiceLabel("angle", text(own?.angle, shot.angle), lists);
    case "subject":
      return text(own?.subject, shot.subject);
    case "cast":
      return list(own?.cast ?? shot.cast);
    case "additionalInfo":
      return text(own?.additionalInfo, shot.additionalInfo);
    case "tags":
      return list((own?.tags ?? shot.tags)?.map((tag) => choiceLabel("tags", tag, lists)));
    case "movement":
      return list(own?.movement ?? e.movement);
    case "system":
      return list(own?.system ?? e.system);
    case "lens":
    case "camera": {
      const rows = (own?.cameras ?? e.cameras).filter((_, index) => cameraRowPrints(project, shot, fieldId, index));
      return list(fieldId === "lens" ? cameraLenses(rows) : cameraNames(rows));
    }
    case "audio":
      return list(own?.audio ?? e.audio);
    case "indicator":
      return text(own?.indicator, e.indicator);
    case "location":
      return text(own?.location, e.location);
    case "time":
      return text(own?.time, e.time);
    case "fps":
      return text(own?.fps, e.fps);
    case "sync":
      return choiceLabel("sync", own?.sync !== undefined ? own.sync : e.sync, lists);
    case "date": {
      const date = own?.date !== undefined ? own.date : e.date;
      return date ? formatExcelDate(date, project.settings.captions.dateFormat) : "";
    }
    case "notes":
      return text(own?.notes, shot.notes);
    case "setup":
      return text(own?.setup, shot.setup);
    default:
      return "";
  }
}

/** Choices shown beside each caption field. Wrapping ones surround the value. */
export const CAPTION_DIVIDERS: { id: CaptionDivider; label: string }[] = [
  { id: "space", label: "Space" },
  { id: "none", label: "No space" },
  { id: "hyphen", label: "Hyphen" },
  { id: "spacedHyphen", label: "Spaced hyphen" },
  { id: "comma", label: "Comma" },
  { id: "slash", label: "Slash" },
  { id: "dot", label: "Dot" },
  { id: "parens", label: "Parentheses" },
  { id: "brackets", label: "Brackets" },
  { id: "braces", label: "Braces" },
  { id: "quotes", label: "Quotes" },
  { id: "custom", label: "Custom" },
];

const DIVIDER_IDS = new Set<string>(CAPTION_DIVIDERS.map((item) => item.id));

export function isCaptionDivider(value: unknown): value is CaptionDivider {
  return typeof value === "string" && DIVIDER_IDS.has(value);
}

/** The divider a field uses when the project has not chosen one. */
export function defaultDivider(id: string, additionalInfoStyle: "parens" | "hyphen" = "parens"): CaptionDivider {
  if (id === "type") return "hyphen";
  if (id === "additionalInfo") return additionalInfoStyle === "hyphen" ? "spacedHyphen" : "parens";
  return "space";
}

/** A custom pattern that keeps the caption looking the way the current divider does. `…` is the value. */
export function customDividerSeed(divider: CaptionDivider | undefined): string {
  switch (divider) {
    case "none":
      return "…";
    case "hyphen":
      return "-…";
    case "spacedHyphen":
      return " - …";
    case "comma":
      return ", …";
    case "slash":
      return " / …";
    case "dot":
      return " · …";
    case "parens":
      return " (…)";
    case "brackets":
      return " […]";
    case "braces":
      return " {…}";
    case "quotes":
      return ' "…"';
    default:
      return " …";
  }
}

function wrapped(text: string, open: string, close: string): string {
  return `${open}${text}${close}`;
}

/** The field's own text, surrounded when the divider wraps it. */
function fieldBody(text: string, field: CaptionField): string {
  switch (field.divider ?? defaultDivider(field.id)) {
    case "parens":
      return wrapped(text, "(", ")");
    case "brackets":
      return wrapped(text, "[", "]");
    case "braces":
      return wrapped(text, "{", "}");
    case "quotes":
      return wrapped(text, '"', '"');
    default:
      return text;
  }
}

/**
 * Custom text. An ellipsis stands for the value, so ` (…)` surrounds it and
 * `-…` joins it with a hyphen. Without an ellipsis the text is only a separator
 * and is left off when this field is the first thing printed.
 */
function customBody(text: string, pattern: string, first: boolean): string {
  const token = pattern.includes("…") ? "…" : pattern.includes("...") ? "..." : "";
  if (!token) return first ? text : pattern + text;
  const rendered = pattern.split(token).join(text);
  return first ? rendered.replace(/^ /, "") : rendered;
}

/** How one field reads after the text before it, with its caption divider: " (Info)" becomes "(Info)". */
export function fieldWithDivider(project: Project, fieldId: string, text: string): string {
  const field = project.settings.captions.fields.find((f) => f.id === fieldId) ?? ({ id: fieldId, print: true } as CaptionField);
  return appendField("", text, field).trim();
}

function appendField(previous: string, text: string, field: CaptionField): string {
  const kind = field.divider ?? defaultDivider(field.id);
  if (kind === "custom") return previous + customBody(text, field.dividerText ?? "", false);
  const body = fieldBody(text, field);
  switch (kind) {
    case "none":
      return previous + body;
    case "hyphen":
      return `${previous}-${body}`;
    case "spacedHyphen":
      return `${previous} - ${body}`;
    case "comma":
      return `${previous}, ${body}`;
    case "slash":
      return `${previous} / ${body}`;
    case "dot":
      return `${previous} · ${body}`;
    default:
      return `${previous} ${body}`;
  }
}

/**
 * The caption for a shot, in the project's field order. Each field brings its
 * own divider, so the usual settings read "1A-WS Subject (Info)" and any other
 * arrangement is made the same way.
 */
export function shotCaption(project: Project, found: FoundShot, own?: MarkOwn): string {
  let caption = "";
  let started = false;
  for (const field of project.settings.captions.fields) {
    // Camera and lens print row by row, so their rows decide.
    const byRow = field.id === "camera" || field.id === "lens";
    if (!byRow && !printsField(project, found.shot, field.id)) continue;
    const text = captionFieldText(project, found, field.id, own);
    if (!text) continue;
    if (!started) {
      const kind = field.divider ?? defaultDivider(field.id);
      caption = kind === "custom" ? customBody(text, field.dividerText ?? "", true) : fieldBody(text, field);
      started = true;
    } else {
      caption = appendField(caption, text, field);
    }
  }
  return caption;
}

/** Short name for a shot in pickers and tabs: "2A WS Alice". */
export function shotName(project: Project, found: FoundShot): string {
  return [captionFieldText(project, found, "shotNumber"), found.shot.type, found.shot.subject]
    .filter(Boolean)
    .join(" ");
}
