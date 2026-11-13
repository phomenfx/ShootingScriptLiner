import { newId } from "../lib/ids";
import { defaultDivider, isCaptionDivider } from "./captions";
import { CAPTION_FIELDS, DEFAULT_TAGS, isCaptionFieldId } from "./registry";
import type {
  CaptionField,
  Ending,
  Project,
  ProjectSettings,
  Scene,
  SceneHeading,
  Shot,
  TextStyle,
} from "./types";

/** What version 1 saves used when they named no font. */
export const DEFAULT_FONT = '"Arial", sans-serif';
/** Captions and notes in new projects: typewriter type, like the script. */
export const DEFAULT_TEXT_FONT = '"Courier New", monospace';
export const DEFAULT_NOTE_COLOR = "#111111";
export const DEFAULT_DATE_FORMAT = "dddd, mmmm d";

export const NO_ENDING: Ending = { type: "none", sizePct: 100, filled: true };

export function defaultTextStyle(): TextStyle {
  return {
    font: DEFAULT_TEXT_FONT,
    sizePt: 11,
    bold: true,
    italic: false,
    underline: false,
    align: "left",
  };
}

export function defaultCaptionFields(): CaptionField[] {
  return CAPTION_FIELDS.map(({ id, print }) => ({ id, print, divider: defaultDivider(id) }));
}

const CUSTOM_DIVIDER_LIMIT = 32;

/** Keeps known fields in their saved order, drops repeats, and appends any that are missing. */
export function completeCaptionFields(raw: unknown, additionalInfoStyle: "parens" | "hyphen" = "parens"): CaptionField[] {
  const result: CaptionField[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const record = item as { id?: unknown; print?: unknown; divider?: unknown; dividerText?: unknown };
      const { id, print } = record;
      if (!isCaptionFieldId(id) || seen.has(id)) continue;
      seen.add(id);
      const divider = isCaptionDivider(record.divider) ? record.divider : defaultDivider(id, additionalInfoStyle);
      const field: CaptionField = { id, print: print === true, divider };
      if (divider === "custom" && typeof record.dividerText === "string") {
        field.dividerText = record.dividerText.slice(0, CUSTOM_DIVIDER_LIMIT);
      }
      result.push(field);
    }
  }
  for (const field of defaultCaptionFields()) {
    if (!seen.has(field.id)) result.push(field);
  }
  return result;
}

export function defaultSettings(): ProjectSettings {
  return {
    general: {
      shotIdStyle: "letter",
      additionalInfoStyle: "parens",
      newShotColor: "#E53935",
      newShotPriority: "nice",
    },
    captions: {
      fields: defaultCaptionFields(),
      offsetAcrossPt: 6,
      offsetAbovePt: 6,
      contGapPt: 2,
      dateFormat: DEFAULT_DATE_FORMAT,
    },
    markDefaults: {
      line: {
        stroke: { pattern: "straight", widthPt: 2 },
        start: { ...NO_ENDING },
        end: { type: "arrow", sizePct: 100, filled: true },
        caption: defaultTextStyle(),
      },
      shape: {
        shape: "rectangle",
        stroke: { pattern: "straight", widthPt: 2 },
      },
      text: {
        color: DEFAULT_NOTE_COLOR,
        style: defaultTextStyle(),
      },
    },
    drawing: {
      angleSnapDegrees: 15,
      firstPageAlone: true,
      newLineCopiesPrevious: false,
    },
    lists: {
      tags: DEFAULT_TAGS.map((tag) => ({ ...tag })),
    },
  };
}

/** See Project.dataRevision. */
export const DATA_REVISION = 1;

export function createProject(): Project {
  return {
    version: 2,
    dataRevision: DATA_REVISION,
    name: "Untitled",
    settings: defaultSettings(),
    scenes: [],
    marks: [],
    assets: [],
  };
}

export function createScene(heading?: Partial<SceneHeading>): Scene {
  return {
    id: newId(),
    visible: true,
    heading: {
      indicator: heading?.indicator ?? "",
      location: heading?.location ?? "",
      time: heading?.time ?? "",
    },
    defaults: { movement: [], system: [], cameras: [], audio: [] },
    shots: [],
  };
}

export function createShot(project: Project): Shot {
  return {
    id: newId(),
    color: project.settings.general.newShotColor,
    visible: true,
    status: project.settings.general.newShotStatus ?? "planned",
    priority: project.settings.general.newShotPriority,
  };
}
