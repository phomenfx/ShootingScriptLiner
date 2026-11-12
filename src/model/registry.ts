/**
 * Built-in entries for every choice field. Saves hold only the keys, so the
 * wording, icon, color and order here can change without touching a save.
 * Adding a built-in entry means adding one row.
 *
 * Projects can extend any list in `settings.lists` with keys that start with
 * `custom:`. A key that is in neither place still loads, shows as its raw
 * text, and saves back unchanged.
 */
import type { ListEntry, Project } from "./types";

export const CUSTOM_PREFIX = "custom:";

export type ChoiceField =
  | "status"
  | "priority"
  | "sync"
  | "angle"
  | "ending"
  | "pattern"
  | "shape"
  | "tags";

const BUILT_IN: Record<ChoiceField, ListEntry[]> = {
  status: [
    { key: "planned", label: "Planned" },
    { key: "shot", label: "Shot", icon: "check" },
    { key: "pickup", label: "Pickup", icon: "rotate-ccw" },
    { key: "cut", label: "Cut", icon: "ban" },
  ],
  priority: [
    { key: "nice", label: "Nice to have" },
    { key: "must", label: "Must have", icon: "star", color: "#e0b040" },
    { key: "low", label: "Low priority", icon: "arrow-down", color: "#888888" },
  ],
  sync: [
    { key: "sync", label: "SYNC" },
    { key: "mos", label: "MOS" },
    { key: "adr", label: "ADR/Foley" },
  ],
  angle: [
    { key: "eye", label: "Eye level" },
    { key: "high", label: "High" },
    { key: "low", label: "Low" },
    { key: "dutch", label: "Dutch" },
    { key: "overhead", label: "Overhead" },
    { key: "ots", label: "Over the shoulder" },
    { key: "pov", label: "POV" },
  ],
  ending: [
    { key: "none", label: "None" },
    { key: "square", label: "Square" },
    { key: "circle", label: "Circle" },
    { key: "diamond", label: "Diamond" },
    { key: "arrow", label: "Arrow" },
    { key: "arrowReversed", label: "Arrow (reversed)" },
    { key: "butt", label: "Butt" },
    { key: "slash", label: "Slash" },
    { key: "bracket", label: "Bracket" },
    { key: "doubleArrow", label: "Double arrow" },
    { key: "dot", label: "Dot" },
  ],
  pattern: [
    { key: "straight", label: "Straight" },
    { key: "dashes", label: "Dashes" },
    { key: "dotted", label: "Dotted" },
    { key: "wavy", label: "Wavy" },
    { key: "zigzag", label: "Zigzag" },
    { key: "double", label: "Double" },
    { key: "triple", label: "Triple" },
    { key: "hashed", label: "Hashed" },
    { key: "straightWavy", label: "Straight + wavy" },
    { key: "hidden", label: "Hidden" },
    // Dash patterns from version 1, kept so old lines look the same.
    { key: "dashed_2_2", label: "Dashes 2-2" },
    { key: "dashed_3_3", label: "Dashes 3-3" },
    { key: "dashed_4_4", label: "Dashes 4-4" },
    { key: "dashed_4_3_2_3", label: "Dash dot" },
    { key: "dashed_4_3_16_3", label: "Short long" },
    { key: "dashed_8_4_4_4", label: "Long short" },
  ],
  shape: [
    { key: "rectangle", label: "Rectangle" },
    { key: "ellipse", label: "Ellipse" },
    { key: "highlight", label: "Highlight" },
    { key: "polygon", label: "Polygon" },
    { key: "star", label: "Star" },
    { key: "bracket", label: "Bracket" },
    { key: "stamp", label: "Stamp" },
  ],
  // Tags have no built-in entries; each project carries its own list.
  tags: [],
};

/** The tag list a new project starts with. */
export const DEFAULT_TAGS: ListEntry[] = [
  { key: "vfx", label: "VFX" },
  { key: "stunt", label: "Stunt" },
  { key: "sfx", label: "SFX" },
  { key: "animal", label: "Animal" },
  { key: "child", label: "Child" },
  { key: "vehicle", label: "Vehicle" },
  { key: "insert", label: "Insert" },
];

export function builtInEntries(field: ChoiceField): readonly ListEntry[] {
  return BUILT_IN[field];
}

/** Built-in entries followed by the project's own. */
export function choiceEntries(
  field: ChoiceField,
  lists: Project["settings"]["lists"] | undefined
): ListEntry[] {
  const own = lists?.[field] ?? [];
  const seen = new Set(BUILT_IN[field].map((e) => e.key));
  return [...BUILT_IN[field], ...own.filter((e) => !seen.has(e.key))];
}

/** Always returns an entry. An unknown key shows as its raw text. */
export function resolveChoice(
  field: ChoiceField,
  key: string,
  lists?: Project["settings"]["lists"]
): ListEntry {
  return (
    BUILT_IN[field].find((e) => e.key === key) ??
    lists?.[field]?.find((e) => e.key === key) ?? { key, label: displayRawKey(key) }
  );
}

export function choiceLabel(
  field: ChoiceField,
  key: string | undefined,
  lists?: Project["settings"]["lists"]
): string {
  return key ? resolveChoice(field, key, lists).label : "";
}

function displayRawKey(key: string): string {
  return key.startsWith(CUSTOM_PREFIX) ? key.slice(CUSTOM_PREFIX.length) : key;
}

/**
 * Finds the key for typed or imported text: a built-in or project entry whose
 * key or label matches without regard to case. Other text is returned as is,
 * so nothing typed is lost.
 */
export function keyForText(
  field: ChoiceField,
  text: string,
  lists?: Project["settings"]["lists"]
): string {
  const wanted = text.trim().toLowerCase();
  if (!wanted) return "";
  const hit = choiceEntries(field, lists).find(
    (e) => e.key.toLowerCase() === wanted || e.label.toLowerCase() === wanted
  );
  return hit ? hit.key : text.trim();
}

/* ---------- Caption fields ---------- */

/** Every field a caption can print, in the default print order. */
export const CAPTION_FIELDS: { id: string; label: string; print: boolean }[] = [
  { id: "shotNumber", label: "Shot number", print: true },
  { id: "type", label: "Shot type", print: true },
  { id: "subject", label: "Subject", print: true },
  { id: "additionalInfo", label: "Additional info", print: true },
  { id: "movement", label: "System/Movement", print: false },
  { id: "lens", label: "Lens", print: false },
  { id: "audio", label: "Audio", print: false },
  { id: "location", label: "Location", print: false },
  { id: "date", label: "Scheduled date", print: false },
  { id: "notes", label: "Notes", print: false },
  { id: "indicator", label: "Indicator", print: false },
  { id: "time", label: "Time", print: false },
  { id: "camera", label: "Camera", print: false },
  { id: "fps", label: "FPS", print: false },
  { id: "sync", label: "Sync", print: false },
  { id: "angle", label: "Angle", print: false },
  { id: "cast", label: "Cast", print: false },
  { id: "tags", label: "Tags", print: false },
];

const CAPTION_FIELD_IDS = new Set(CAPTION_FIELDS.map((f) => f.id));

export function isCaptionFieldId(id: unknown): id is string {
  return typeof id === "string" && CAPTION_FIELD_IDS.has(id);
}
