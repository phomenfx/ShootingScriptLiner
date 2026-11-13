/*
 * Scene headings found in the script's own text (no OCR). A heading starts
 * with INT., EXT., INT./EXT., EXT./INT., I/E or EST., optionally after a
 * scene number ("2." or "2"), and may end with the number again.
 */
import { createScene } from "./defaults";
import type { Project, Scene, SceneHeading } from "./types";

export type FoundHeading = {
  /** Printed scene number's whole part, when the script numbers its scenes. */
  number?: number;
  heading: SceneHeading;
  page: number;
};

const INDICATOR = /^(INT\.?\s*\/\s*EXT\.?|EXT\.?\s*\/\s*INT\.?|I\s*\/\s*E\.?|INT\.|EXT\.|EST\.|INT|EXT|EST)(?=\s)/i;
const NUMBER = /^(\d+)[A-Z]?\.?(?=\s)/i;
const TRAILING_NUMBER = /\s+\d+[A-Z]?\.?$/i;
/** Separators between location and time: " - ", " – ", " — ". */
const TIME_SPLIT = /\s+[-–—]+\s+/;

/** Tidies an indicator: "int" → "INT.", "int/ext" → "INT./EXT.", "i/e" → "I/E". */
function tidyIndicator(raw: string): string {
  const up = raw.toUpperCase().replace(/\s+/g, "");
  if (up.startsWith("I/E")) return "I/E";
  if (up.includes("/")) {
    const [a, b] = up.split("/");
    return `${a!.replace(/\.$/, "")}./${b!.replace(/\.$/, "")}.`;
  }
  return `${up.replace(/\.$/, "")}.`;
}

/** One line of script text as a heading, or null. */
export function parseSceneHeading(line: string): Omit<FoundHeading, "page"> | null {
  let text = line.replace(/\s+/g, " ").trim();
  let number: number | undefined;
  const numbered = NUMBER.exec(text);
  if (numbered) {
    number = Number(numbered[1]);
    text = text.slice(numbered[0].length).trim();
  }
  const indicator = INDICATOR.exec(text);
  if (!indicator) return null;
  let rest = text.slice(indicator[0].length).trim();
  // A number printed again at the end of the line (right margin).
  rest = rest.replace(TRAILING_NUMBER, "").trim();
  if (!rest) return null;
  // Headings are written in capitals; mixed-case lines are action that happens to start with "Int".
  if (rest !== rest.toUpperCase()) return null;
  const parts = rest.split(TIME_SPLIT);
  const time = parts.length > 1 ? parts.pop()!.trim() : "";
  const location = parts.join(" - ").trim();
  return { ...(number !== undefined ? { number } : {}), heading: { indicator: tidyIndicator(indicator[1]!), location, time } };
}

/** Headings in reading order from the lines of each page. */
export function findHeadings(pages: string[][]): FoundHeading[] {
  const found: FoundHeading[] = [];
  pages.forEach((lines, index) => {
    for (const line of lines) {
      const hit = parseSceneHeading(line);
      if (hit) found.push({ ...hit, page: index + 1 });
    }
  });
  return found;
}

const headingKey = (h: SceneHeading) => [h.indicator, h.location, h.time].map((s) => s.trim().toUpperCase().replace(/\s+/g, " ")).join("|");

/**
 * The script page a scene starts on: the heading with the same text (the nth
 * scene with that text takes the nth such heading), else the heading with its
 * scene number, else the heading in its position when the counts agree.
 */
export function scenePage(project: Project, index: number, found: FoundHeading[]): number | undefined {
  const scene = project.scenes[index];
  if (!scene) return undefined;
  const key = headingKey(scene.heading);
  if (key !== "||") {
    const nth = project.scenes.slice(0, index).filter((s) => headingKey(s.heading) === key).length;
    const hits = found.filter((h) => headingKey(h.heading) === key);
    const hit = hits[nth] ?? hits[0];
    if (hit) return hit.page;
  }
  const used = usableHeadings(found);
  const numbered = used.find((h) => h.number === index + 1);
  if (numbered) return numbered.page;
  if (used.length === project.scenes.length) return used[index]?.page;
  return undefined;
}

const isBlank = (scene: Scene) => !scene.heading.indicator.trim() && !scene.heading.location.trim() && !scene.heading.time.trim();

export type ScenePlan = {
  project: Project;
  /** Scenes given a heading. */
  filled: number;
  /** Blank scenes made to keep the numbering (a "2." with no scene 1). */
  blanks: number;
  /** Headings left alone because that scene already has one. */
  kept: number;
  /** The headings used: when most are numbered, unnumbered ones (a title page, say) are skipped. */
  used: FoundHeading[];
};

export function usableHeadings(found: FoundHeading[]): FoundHeading[] {
  const numbered = found.filter((h) => h.number !== undefined);
  return numbered.length > 0 && numbered.length * 2 >= found.length ? numbered : found;
}

/**
 * Puts found headings into the scene list. Numbered headings go to that scene
 * number, making blank scenes for any gap; unnumbered ones follow in order.
 * A scene that already has a heading keeps it.
 */
export function planScenes(project: Project, found: FoundHeading[]): ScenePlan {
  const scenes = [...project.scenes];
  let filled = 0;
  let blanks = 0;
  let kept = 0;
  let next = 0;
  const used = usableHeadings(found);
  for (const hit of used) {
    // Numbered: that position. Unnumbered: right after the last one placed.
    const index = hit.number !== undefined && hit.number > 0 ? hit.number - 1 : next;
    while (scenes.length <= index) {
      scenes.push(createScene());
      if (scenes.length - 1 < index) blanks += 1;
    }
    const scene = scenes[index]!;
    if (isBlank(scene)) {
      scenes[index] = { ...scene, heading: { ...hit.heading } };
      filled += 1;
    } else kept += 1;
    next = index + 1;
  }
  return { project: { ...project, scenes }, filled, blanks, kept, used };
}
