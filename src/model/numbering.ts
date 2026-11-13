/*
 * Scene and shot numbers. A scene or shot can keep a number typed for it
 * (Scene.number, Shot.number); one without counts on from the one before, so a
 * project nobody has numbered reads 1A, 1B, 2A… by position. Typed numbers
 * allow gaps (1A, 1C) and inserts (5A, 12B).
 */
import type { Project, Scene, Shot } from "./types";

type Style = Project["settings"]["general"]["shotIdStyle"];

/** Excel-style letters: 0 → A, 25 → Z, 26 → AA. */
export function indexToLetters(index: number): string {
  let n = index;
  let result = "";
  while (n >= 0) {
    result = String.fromCharCode((n % 26) + 65) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

/** A shot number's place in the count (A = 0, or 1 = 0), when it is one. */
export function suffixValue(text: string, style: Style): number | undefined {
  const t = text.trim().toUpperCase();
  if (style === "letter") {
    if (!/^[A-Z]+$/.test(t)) return undefined;
    let n = 0;
    for (const c of t) n = n * 26 + (c.charCodeAt(0) - 64);
    return n - 1;
  }
  return /^\d+$/.test(t) && Number(t) > 0 ? Number(t) - 1 : undefined;
}

const formatSuffix = (value: number, style: Style) => (style === "letter" ? indexToLetters(value) : String(value + 1));

/** Tidies a typed number: trimmed and upper case. */
export const cleanNumber = (text: string) => text.trim().toUpperCase();

const sceneCache = new WeakMap<Scene[], string[]>();

/** Every scene's number, in list order. */
export function sceneNumbers(project: Project): string[] {
  const hit = sceneCache.get(project.scenes);
  if (hit) return hit;
  let previous = 0;
  const numbers = project.scenes.map((scene) => {
    const own = scene.number?.trim();
    if (own) {
      const whole = /^\d+/.exec(own);
      if (whole) previous = Number(whole[0]);
      return own;
    }
    previous += 1;
    return String(previous);
  });
  sceneCache.set(project.scenes, numbers);
  return numbers;
}

export const sceneNumber = (project: Project, sceneIndex: number) => sceneNumbers(project)[sceneIndex] ?? String(sceneIndex + 1);

const shotCache = new WeakMap<Shot[], { style: Style; suffixes: string[]; values: number[] }>();

function shotCount(shots: Shot[], style: Style) {
  const hit = shotCache.get(shots);
  if (hit && hit.style === style) return hit;
  let previous = -1;
  const suffixes: string[] = [];
  const values: number[] = [];
  for (const shot of shots) {
    const own = shot.number?.trim();
    const value = own ? suffixValue(own, style) : undefined;
    if (own && value === undefined) {
      // Something the count can't read ("X", "1B2"): shown as typed, the count goes on.
      suffixes.push(cleanNumber(own));
      values.push(previous + 0.5);
      continue;
    }
    previous = value ?? previous + 1;
    suffixes.push(formatSuffix(previous, style));
    values.push(previous);
  }
  const result = { style, suffixes, values };
  shotCache.set(shots, result);
  return result;
}

/** Each shot's number within its scene (A, B… or 1, 2…), in list order. */
export const shotSuffixes = (scene: Scene, style: Style) => shotCount(scene.shots, style).suffixes;

export function joinShotNumber(scene: string, suffix: string, style: Style): string {
  if (!scene) return suffix;
  if (!suffix) return scene;
  return style === "letter" ? `${scene}${suffix}` : `${scene}.${suffix}`;
}

/** A shot's full number: 1A, 12B, 5A.3… */
export function shotNumber(project: Project, sceneIndex: number, shotIndex: number): string {
  const scene = project.scenes[sceneIndex];
  const style = project.settings.general.shotIdStyle;
  if (!scene) return "";
  return joinShotNumber(sceneNumber(project, sceneIndex), shotSuffixes(scene, style)[shotIndex] ?? "", style);
}

/** Where a scene number is in the list, or -1. */
export function findSceneByNumber(project: Project, text: string): number {
  const wanted = cleanNumber(text);
  return sceneNumbers(project).findIndex((n) => cleanNumber(n) === wanted);
}

/** Where a shot number is in a scene, or -1. */
export function findShotBySuffix(project: Project, sceneIndex: number, text: string): number {
  const scene = project.scenes[sceneIndex];
  if (!scene) return -1;
  const wanted = cleanNumber(text);
  return shotSuffixes(scene, project.settings.general.shotIdStyle).findIndex((s) => s === wanted);
}

/** Switches letters and numbers, converting typed shot numbers (C ↔ 3) so they keep their place. */
export function setShotIdStyle(project: Project, style: Style): Project {
  const from = project.settings.general.shotIdStyle;
  if (from === style) return project;
  return {
    ...project,
    settings: { ...project.settings, general: { ...project.settings.general, shotIdStyle: style } },
    scenes: project.scenes.map((scene) =>
      !scene.shots.some((s) => s.number !== undefined)
        ? scene
        : {
            ...scene,
            shots: scene.shots.map((shot) => {
              if (shot.number === undefined) return shot;
              const value = suffixValue(shot.number, from);
              return value === undefined ? shot : { ...shot, number: formatSuffix(value, style) };
            }),
          }
    ),
  };
}

/* ---------- renumbering ---------- */

/** Keeps every shot of a scene at the number it shows now, so changing one moves no others. */
function freezeShots(scene: Scene, style: Style): Scene {
  const suffixes = shotSuffixes(scene, style);
  return { ...scene, shots: scene.shots.map((shot, i) => (shot.number === suffixes[i] ? shot : { ...shot, number: suffixes[i]! })) };
}

function freezeScenes(project: Project): Project {
  const numbers = sceneNumbers(project);
  return { ...project, scenes: project.scenes.map((scene, i) => (scene.number === numbers[i] ? scene : { ...scene, number: numbers[i]! })) };
}

function locate(project: Project, shotId: string) {
  for (let sceneIndex = 0; sceneIndex < project.scenes.length; sceneIndex += 1) {
    const shotIndex = project.scenes[sceneIndex]!.shots.findIndex((s) => s.id === shotId);
    if (shotIndex >= 0) return { sceneIndex, shotIndex };
  }
  return null;
}

export type RenumberResult =
  | { kind: "done"; project: Project }
  /** Another shot already has that number; it is `shotId`. */
  | { kind: "taken"; project: Project; shotId: string }
  | { kind: "error"; message: string };

/**
 * Gives a shot a scene and number. A free number moves the shot there, in
 * number order; numbers the scenes already show stay put. A blank number goes
 * back to counting on from the shot before. With `swap`, a number another shot
 * has trades places and numbers with it; otherwise that shot is reported back.
 */
export function renumberShot(project: Project, shotId: string, sceneText: string, numberText: string, swap: boolean): RenumberResult {
  const style = project.settings.general.shotIdStyle;
  const from = locate(project, shotId);
  if (!from) return { kind: "error", message: "That shot is gone." };
  const toScene = sceneText.trim() ? findSceneByNumber(project, sceneText) : from.sceneIndex;
  if (toScene < 0) return { kind: "error", message: `There is no scene ${cleanNumber(sceneText)}.` };
  const suffix = cleanNumber(numberText);
  const shot = project.scenes[from.sceneIndex]!.shots[from.shotIndex]!;

  if (suffix) {
    const at = findShotBySuffix(project, toScene, suffix);
    if (at >= 0 && !(toScene === from.sceneIndex && at === from.shotIndex)) {
      const other = project.scenes[toScene]!.shots[at]!;
      if (!swap) return { kind: "taken", project, shotId: other.id };
      // Trade places and numbers.
      const scenes = project.scenes.map((scene, i) => (i === from.sceneIndex || i === toScene ? freezeShots(scene, style) : scene));
      const mine = scenes[from.sceneIndex]!.shots[from.shotIndex]!;
      const theirs = scenes[toScene]!.shots[at]!;
      // Each takes the other's place and number.
      const next = scenes.map((scene) => ({
        ...scene,
        shots: scene.shots.map((s) => (s.id === mine.id ? { ...theirs, number: mine.number } : s.id === theirs.id ? { ...mine, number: theirs.number } : s)),
      }));
      return { kind: "done", project: { ...project, scenes: next } };
    }
  } else if (toScene === from.sceneIndex) {
    // Blank in the same scene: count on from the shot before.
    if (shot.number === undefined) return { kind: "done", project };
    const { number: _gone, ...rest } = shot;
    return { kind: "done", project: replaceShot(project, from.sceneIndex, from.shotIndex, rest) };
  }

  if (toScene === from.sceneIndex && suffix === shotSuffixes(project.scenes[toScene]!, style)[from.shotIndex]) return { kind: "done", project };

  // Keep the numbers both scenes show now, take the shot out, and put it in its place.
  const scenes = project.scenes.map((scene, i) => (i === from.sceneIndex || i === toScene ? freezeShots(scene, style) : scene));
  const source = scenes[from.sceneIndex]!;
  scenes[from.sceneIndex] = { ...source, shots: source.shots.filter((s) => s.id !== shotId) };
  const target = scenes[toScene]!;
  const moved: Shot = { ...shot };
  if (suffix) moved.number = suffix;
  else delete moved.number;
  let index = target.shots.length;
  const value = suffix ? suffixValue(suffix, style) : undefined;
  if (value !== undefined) {
    const values = shotCount(target.shots, style).values;
    const after = values.findIndex((v) => v > value);
    if (after >= 0) index = after;
  }
  const shots = [...target.shots];
  shots.splice(index, 0, moved);
  scenes[toScene] = { ...target, shots };
  return { kind: "done", project: { ...project, scenes } };
}

function replaceShot(project: Project, sceneIndex: number, shotIndex: number, shot: Shot): Project {
  return {
    ...project,
    scenes: project.scenes.map((scene, i) => (i === sceneIndex ? { ...scene, shots: scene.shots.map((s, j) => (j === shotIndex ? shot : s)) } : scene)),
  };
}

const sceneKey = (text: string): [number, string] => {
  const m = /^(\d+)(.*)$/.exec(cleanNumber(text));
  return m ? [Number(m[1]), m[2]!] : [Number.POSITIVE_INFINITY, cleanNumber(text)];
};
const compareScene = (a: string, b: string) => {
  const [an, ar] = sceneKey(a);
  const [bn, br] = sceneKey(b);
  return an !== bn ? an - bn : ar < br ? -1 : ar > br ? 1 : 0;
};

/**
 * Gives a scene a number. A free number moves the scene there, in number order;
 * a number another scene has trades places and numbers with it. Blank goes
 * back to counting on from the scene before.
 */
export function renumberScene(project: Project, sceneId: string, text: string): RenumberResult {
  const index = project.scenes.findIndex((s) => s.id === sceneId);
  if (index < 0) return { kind: "error", message: "That scene is gone." };
  const wanted = cleanNumber(text);
  const scene = project.scenes[index]!;
  if (!wanted) {
    if (scene.number === undefined) return { kind: "done", project };
    const { number: _gone, ...rest } = scene;
    return { kind: "done", project: { ...project, scenes: project.scenes.map((s, i) => (i === index ? rest : s)) } };
  }
  if (cleanNumber(sceneNumber(project, index)) === wanted) return { kind: "done", project };
  const frozen = freezeScenes(project);
  const at = findSceneByNumber(project, wanted);
  if (at >= 0) {
    const scenes = [...frozen.scenes];
    const a = scenes[index]!;
    const b = scenes[at]!;
    scenes[index] = { ...b, number: a.number };
    scenes[at] = { ...a, number: b.number };
    return { kind: "done", project: { ...frozen, scenes } };
  }
  const rest = frozen.scenes.filter((s) => s.id !== sceneId);
  let to = rest.findIndex((s) => compareScene(s.number!, wanted) > 0);
  if (to < 0) to = rest.length;
  rest.splice(to, 0, { ...frozen.scenes[index]!, number: wanted });
  return { kind: "done", project: { ...frozen, scenes: rest } };
}

/** Forgets typed shot numbers in a scene, so its shots count 1A, 1B… in list order again. */
export function clearShotNumbers(project: Project, sceneId: string): Project {
  return {
    ...project,
    scenes: project.scenes.map((scene) =>
      scene.id !== sceneId || !scene.shots.some((s) => s.number !== undefined)
        ? scene
        : { ...scene, shots: scene.shots.map(({ number: _gone, ...rest }) => rest) }
    ),
  };
}
