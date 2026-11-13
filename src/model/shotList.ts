/**
 * Read-only helpers shared by the Scenes list and the shot-list table:
 * shot IDs, status and priority cycling, searching, and line counts.
 */
import { builtInEntries, choiceEntries, choiceLabel } from "./registry";
import { sceneNumber, shotNumber } from "./numbering";
import type { Project, Scene, Shot } from "./types";

export { indexToLetters } from "./numbering";

/** A shot's number: typed, or counted on from the one before (1A, 1B… or 1.1, 1.2…). */
export const shotIdLabel = (project: Project, sceneIndex: number, shotIndex: number): string => shotNumber(project, sceneIndex, shotIndex);

/** The next entry of a choice list after `key`, wrapping around. Unknown keys start over. */
function nextChoice(field: "status" | "priority", key: string, lists: Project["settings"]["lists"]): string {
  const keys = choiceEntries(field, lists).map((entry) => entry.key);
  return keys[(keys.indexOf(key) + 1) % keys.length] ?? builtInEntries(field)[0]!.key;
}

/** Planned → Shot → Pickup → Cut → Planned (then any custom entries). */
export const nextStatus = (key: string, lists: Project["settings"]["lists"]) =>
  nextChoice("status", key, lists);

/** Nice to have → Must have → Low priority → Nice to have. */
export const nextPriority = (key: string, lists: Project["settings"]["lists"]) =>
  nextChoice("priority", key, lists);

/** How many lines each shot has on the script. */
export function lineCountsByShot(project: Project): Map<string, number> {
  const counts = new Map<string, number>();
  for (const mark of project.marks) {
    if (mark.kind === "line" && mark.shotId) counts.set(mark.shotId, (counts.get(mark.shotId) ?? 0) + 1);
  }
  return counts;
}

function matches(text: string | undefined, needle: string): boolean {
  return !!text && text.toLowerCase().includes(needle);
}

function shotMatches(shot: Shot, id: string, needle: string, project: Project): boolean {
  const lists = project.settings.lists;
  return (
    matches(id, needle) ||
    matches(shot.type, needle) ||
    matches(shot.subject, needle) ||
    matches(shot.additionalInfo, needle) ||
    matches(shot.angle, needle) ||
    matches(shot.notes, needle) ||
    matches(shot.setup, needle) ||
    (shot.cast ?? []).some((name) => matches(name, needle)) ||
    (shot.tags ?? []).some((tag) => matches(choiceLabel("tags", tag, lists), needle)) ||
    matches(choiceLabel("status", shot.status, lists), needle)
  );
}

export type ListedShot = { shot: Shot; shotIndex: number; id: string };
export type ListedScene = { scene: Scene; sceneIndex: number; number: string; shots: ListedShot[] };

/**
 * Scenes and shots in order, each with its position and ID. With a search,
 * only matching shots are kept; a scene whose heading matches keeps all of its
 * shots, and scenes with nothing to show are dropped.
 */
export function listScenes(project: Project, search = ""): ListedScene[] {
  const needle = search.trim().toLowerCase();
  const result: ListedScene[] = [];
  project.scenes.forEach((scene, sceneIndex) => {
    const all = scene.shots.map((shot, shotIndex) => ({
      shot,
      shotIndex,
      id: shotIdLabel(project, sceneIndex, shotIndex),
    }));
    if (!needle) {
      result.push({ scene, sceneIndex, number: sceneNumber(project, sceneIndex), shots: all });
      return;
    }
    const { indicator, location, time } = scene.heading;
    const headingHit = matches(`${sceneNumber(project, sceneIndex)} ${indicator} ${location} ${time}`, needle);
    const shots = headingHit ? all : all.filter((item) => shotMatches(item.shot, item.id, needle, project));
    if (headingHit || shots.length > 0) result.push({ scene, sceneIndex, number: sceneNumber(project, sceneIndex), shots });
  });
  return result;
}
