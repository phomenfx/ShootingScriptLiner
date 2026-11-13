/*
 * Suggestion lists for shot fields (shot type, angle, cast, movement…). Each
 * project keeps its own lists; a project without one uses my defaults (saved
 * in this browser), else the built-in starting list. Cast belongs to one
 * project only and never becomes a default.
 */
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
  // Wide to tight, then by how many people, then special shots.
  type: ["Establishing", "ES", "LS", "FS", "WS", "MWS", "MLS", "Cowboy", "CB", "MS", "MCU", "CU", "ECU", "Single", "1S", "Two Shot", "2 Shot", "2S", "3 Shot", "3S", "OTS", "POV", "Insert"],
  // By camera height, top to bottom, then tilted and point-of-view angles.
  angle: [
    "Aerial", "Birds Eye", "Overhead", "OH", "High", "HA", "Eye level", "EL", "Shoulder level", "SL", "Hip level", "HL",
    "Knee level", "KL", "Low", "LA", "Ground level", "GL", "Ground", "Dutch", "Canted", "Over the shoulder", "OTS", "POV",
  ],
  cast: [],
  // Still, then turning in place, then moving the camera, then rising and falling.
  movement: ["Static", "Fixed", "Pan", "Whip", "Tilt", "Zoom", "Push In", "Pull Out", "Dolly In", "Dolly Out", "Dolly Zoom", "Truck", "Crab", "Arc", "Tracking", "Car", "Crane Up", "Crane Down"],
  // On the ground and handheld, then on wheels or arms, then vehicles and air.
  system: ["Sticks", "Handheld", "EasyRig", "Steadicam", "Gimbal", "Slider", "Dolly", "Jib", "Crane", "Car Mount", "Drone"],
  lenses: ["14mm", "18mm", "25mm", "35mm", "50mm", "75mm", "85mm", "100mm", "135mm"],
  audio: ["Boom", "Lav", "Handheld", "Recorder"],
  fps: ["23.976", "24", "25", "29.97", "30", "59.94", "60", "120"],
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
