import type { Scene } from "../types/project";

const INDICATOR = /^(INT\.\/EXT\.|INT\.|EXT\.)\s*/i;

export function composeSlugline(indicator: string, location: string, timeOfDay: string): string {
  const head = [indicator.trim(), location.trim()].filter(Boolean).join(" ");
  const time = timeOfDay.trim();
  if (head && time) return `${head} - ${time}`;
  return head || time;
}

function canonicalIndicator(raw: string): string {
  const upper = raw.toUpperCase();
  if (upper === "INT./EXT." || upper === "INT." || upper === "EXT.") return upper;
  return raw.trim();
}

/** Split a saved heading into the three scene-name parts. Unmatched text stays in location. */
export function splitSlugline(slugline: string): {
  indicator: string;
  location: string;
  timeOfDay: string;
} {
  let rest = slugline.trim();
  let indicator = "";
  const lead = INDICATOR.exec(rest);
  if (lead?.[1]) {
    indicator = canonicalIndicator(lead[1]);
    rest = rest.slice(lead[0].length).trim();
  }
  let timeOfDay = "";
  const marker = " - ";
  const splitAt = rest.lastIndexOf(marker);
  if (splitAt >= 0) {
    const time = rest.slice(splitAt + marker.length).trim();
    const head = rest.slice(0, splitAt).trim();
    if (time) {
      timeOfDay = time;
      rest = head;
    }
  }
  return { indicator, location: rest, timeOfDay };
}

/** Fill indicator, location, and time from slugline when all three are still empty. */
export function migrateSceneSlugline<T extends Scene>(scene: T): T {
  const indicator = scene.indicator?.trim() ?? "";
  const location = scene.location?.trim() ?? "";
  const timeOfDay = scene.timeOfDay?.trim() ?? "";
  const slugline = scene.slugline?.trim() ?? "";
  if (indicator || location || timeOfDay || !slugline) return scene;
  const parts = splitSlugline(slugline);
  return {
    ...scene,
    indicator: parts.indicator,
    location: parts.location,
    timeOfDay: parts.timeOfDay,
    slugline: composeSlugline(parts.indicator, parts.location, parts.timeOfDay),
  };
}

/** Rebuild slugline when one of the three name parts changes. */
export function applyScenePatch(scene: Scene, patch: Partial<Scene>): Scene {
  const next: Scene = { ...scene, ...patch };
  if ("indicator" in patch || "location" in patch || "timeOfDay" in patch) {
    next.slugline = composeSlugline(next.indicator ?? "", next.location ?? "", next.timeOfDay ?? "");
  }
  return next;
}
