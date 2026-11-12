import { newId } from "../lib/ids";
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

export const DEFAULT_FONT = '"Arial", sans-serif';
export const DEFAULT_NOTE_COLOR = "#111111";
export const DEFAULT_DATE_FORMAT = "dddd, mmmm d";

export const NO_ENDING: Ending = { type: "none", sizePct: 100, filled: true };

export function defaultTextStyle(): TextStyle {
  return {
    font: DEFAULT_FONT,
    sizePt: 11,
    bold: true,
    italic: false,
    underline: false,
    align: "left",
  };
}

export function defaultCaptionFields(): CaptionField[] {
  return CAPTION_FIELDS.map(({ id, print }) => ({ id, print }));
}

/** Keeps known fields in their saved order, drops repeats, and appends any that are missing. */
export function completeCaptionFields(raw: unknown): CaptionField[] {
  const result: CaptionField[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const { id, print } = item as { id?: unknown; print?: unknown };
      if (!isCaptionFieldId(id) || seen.has(id)) continue;
      seen.add(id);
      result.push({ id, print: print === true });
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
      newShotColor: "#FF0000",
      newShotPriority: "nice",
    },
    captions: {
      fields: defaultCaptionFields(),
      offsetAcrossPt: 3,
      offsetAbovePt: 4,
      contGapPt: 4,
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

export function createProject(): Project {
  return {
    version: 2,
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
    defaults: { movement: [], cameras: [], audio: [] },
    shots: [],
  };
}

export function createShot(project: Project): Shot {
  return {
    id: newId(),
    color: project.settings.general.newShotColor,
    visible: true,
    status: "planned",
    priority: project.settings.general.newShotPriority,
  };
}
