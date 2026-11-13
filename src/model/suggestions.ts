/*
 * Suggestion lists for shot fields (shot type, angle, cast, movement…). Each
 * project keeps its own lists; a project without one uses my defaults (saved
 * in this browser), else the built-in starting list. Cast belongs to one
 * project only and never becomes a default.
 */
import { builtInEntries } from "./registry";
import type { Project, ProjectSettings } from "./types";

export const SUGGESTION_FIELDS = [
  { id: "type", label: "Shot type", single: true },
  { id: "angle", label: "Angle", single: true },
  { id: "cast", label: "Cast", single: false },
  { id: "movement", label: "Movement", single: false },
  { id: "system", label: "System", single: false },
  { id: "lenses", label: "Lenses", single: false },
  { id: "audio", label: "Audio", single: false },
  { id: "fps", label: "FPS", single: true },
] as const;

export type SuggestionField = (typeof SUGGESTION_FIELDS)[number]["id"];
export type SuggestionLists = Partial<Record<SuggestionField, string[]>>;

/** Lists that stay with their project: never saved as my defaults. */
export const PROJECT_ONLY: SuggestionField[] = ["cast"];

export const BUILT_IN_SUGGESTIONS: Record<SuggestionField, string[]> = {
  type: ["WS", "MWS", "MS", "MCU", "CU", "ECU", "OTS", "POV", "Two Shot", "Insert", "Establishing"],
  angle: builtInEntries("angle").map((e) => e.label),
  cast: [],
  movement: ["Static", "Pan", "Tilt", "Push In", "Pull Out", "Dolly In", "Dolly Out", "Truck", "Zoom", "Tracking", "Crane Up", "Crane Down"],
  system: ["Sticks", "Handheld", "Steadicam", "Gimbal", "Dolly", "Slider", "Jib", "Crane", "Drone", "Car Mount"],
  lenses: ["14mm", "18mm", "25mm", "35mm", "50mm", "75mm", "85mm", "100mm", "135mm"],
  audio: ["Boom", "Lav", "Plant", "Wild", "Room Tone"],
  fps: ["23.976", "24", "25", "29.97", "30", "48", "50", "59.94", "60", "120"],
};

/** The list a field offers in this project. */
export function suggestionsFor(project: Project, field: SuggestionField, myDefaults: SuggestionLists): string[] {
  const own = project.settings.suggestions?.[field];
  if (own) return own;
  if (PROJECT_ONLY.includes(field)) return BUILT_IN_SUGGESTIONS[field];
  return myDefaults[field] ?? BUILT_IN_SUGGESTIONS[field];
}

/** Settings with values typed in that the list doesn't have yet added to it. */
export function rememberSuggestions(
  settings: ProjectSettings,
  field: SuggestionField,
  current: string[],
  values: string[]
): ProjectSettings {
  const known = new Set(current.map((v) => v.toLowerCase()));
  const added: string[] = [];
  for (const raw of values) {
    const v = raw.trim();
    if (!v || known.has(v.toLowerCase())) continue;
    known.add(v.toLowerCase());
    added.push(v);
  }
  if (added.length === 0) return settings;
  return { ...settings, suggestions: { ...settings.suggestions, [field]: [...current, ...added] } };
}

/** My defaults from a project's lists, leaving out project-only ones. */
export function defaultsFromProject(project: Project, myDefaults: SuggestionLists): SuggestionLists {
  const out: SuggestionLists = {};
  for (const { id } of SUGGESTION_FIELDS) {
    if (PROJECT_ONLY.includes(id)) continue;
    out[id] = suggestionsFor(project, id, myDefaults);
  }
  return out;
}
