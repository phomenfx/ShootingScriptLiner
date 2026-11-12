/**
 * Pure edits on a project. Each returns a new project and leaves untouched
 * parts shared with the old one, so unchanged scenes and marks keep their
 * identity. Stores, commands and tests all go through these.
 */
import { newId } from "../lib/ids";
import type {
  LineMark,
  Mark,
  Project,
  ProjectSettings,
  Scene,
  ScriptInfo,
  Shot,
  ShotOwn,
} from "./types";

export type Edit = (project: Project) => Project;

/* ---------- lookups ---------- */

export type FoundShot = { scene: Scene; shot: Shot; sceneIndex: number; shotIndex: number };

export function findShot(project: Project, shotId: string | undefined): FoundShot | null {
  if (!shotId) return null;
  for (let sceneIndex = 0; sceneIndex < project.scenes.length; sceneIndex += 1) {
    const scene = project.scenes[sceneIndex]!;
    const shotIndex = scene.shots.findIndex((shot) => shot.id === shotId);
    if (shotIndex >= 0) return { scene, shot: scene.shots[shotIndex]!, sceneIndex, shotIndex };
  }
  return null;
}

export function findMark(project: Project, markId: string | undefined): Mark | null {
  if (!markId) return null;
  return project.marks.find((mark) => mark.id === markId) ?? null;
}

export function markShotId(mark: Mark): string | undefined {
  return mark.kind === "image" ? undefined : mark.shotId;
}

/** The value a shot uses for a scene field: its own when unlocked, else the scene's. */
export function effectiveShotValue<K extends keyof ShotOwn>(
  scene: Scene,
  shot: Shot,
  field: K
): NonNullable<ShotOwn[K]> | undefined {
  const own = shot.own?.[field];
  if (own !== undefined) return own as NonNullable<ShotOwn[K]>;
  if (field === "indicator" || field === "location" || field === "time") {
    return scene.heading[field as keyof Scene["heading"]] as NonNullable<ShotOwn[K]>;
  }
  return scene.defaults[field as keyof Scene["defaults"]] as NonNullable<ShotOwn[K]> | undefined;
}

/* ---------- project ---------- */

export const setName =
  (name: string): Edit =>
  (project) =>
    project.name === name ? project : { ...project, name };

export const updateSettings =
  (recipe: (settings: ProjectSettings) => ProjectSettings): Edit =>
  (project) => {
    const settings = recipe(project.settings);
    return settings === project.settings ? project : { ...project, settings };
  };

/** Records which PDF the project is lined on. */
export const setScript =
  (script: ScriptInfo | undefined): Edit =>
  (project) => {
    if (script) return { ...project, script };
    const { script: _removed, ...rest } = project;
    return rest;
  };

/* ---------- scenes ---------- */

export const addScene =
  (scene: Scene, atIndex?: number): Edit =>
  (project) => {
    const scenes = [...project.scenes];
    scenes.splice(atIndex ?? scenes.length, 0, scene);
    return { ...project, scenes };
  };

export const updateScene =
  (sceneId: string, recipe: (scene: Scene) => Scene): Edit =>
  (project) => {
    let changed = false;
    const scenes = project.scenes.map((scene) => {
      if (scene.id !== sceneId) return scene;
      const next = recipe(scene);
      if (next !== scene) changed = true;
      return next;
    });
    return changed ? { ...project, scenes } : project;
  };

export const moveScene =
  (sceneId: string, toIndex: number): Edit =>
  (project) => {
    const from = project.scenes.findIndex((scene) => scene.id === sceneId);
    if (from < 0) return project;
    const to = Math.max(0, Math.min(project.scenes.length - 1, toIndex));
    if (from === to) return project;
    const scenes = [...project.scenes];
    const [moving] = scenes.splice(from, 1);
    scenes.splice(to, 0, moving!);
    return { ...project, scenes };
  };

/** Removes the scene and its shots. Marks linked to those shots stay, unlinked. */
export const deleteScene =
  (sceneId: string): Edit =>
  (project) => {
    const scene = project.scenes.find((sc) => sc.id === sceneId);
    if (!scene) return project;
    const unlinked = unlinkShots(project, scene.shots);
    return { ...unlinked, scenes: unlinked.scenes.filter((sc) => sc.id !== sceneId) };
  };

/* ---------- shots ---------- */

export const addShot =
  (sceneId: string, shot: Shot, atIndex?: number): Edit =>
  updateScene(sceneId, (scene) => {
    const shots = [...scene.shots];
    shots.splice(atIndex ?? shots.length, 0, shot);
    return { ...scene, shots };
  });

export const updateShot =
  (shotId: string, recipe: (shot: Shot, scene: Scene) => Shot): Edit =>
  (project) => {
    const found = findShot(project, shotId);
    if (!found) return project;
    const next = recipe(found.shot, found.scene);
    if (next === found.shot) return project;
    return updateScene(found.scene.id, (scene) => ({
      ...scene,
      shots: scene.shots.map((shot) => (shot.id === shotId ? next : shot)),
    }))(project);
  };

/**
 * Sets or clears one scene field a shot overrides. `undefined` relocks the
 * field so it follows the scene again.
 */
export const setShotOwn =
  <K extends keyof ShotOwn>(shotId: string, field: K, value: ShotOwn[K] | undefined): Edit =>
  updateShot(shotId, (shot) => {
    const own: ShotOwn = { ...shot.own };
    if (value === undefined) delete own[field];
    else own[field] = value;
    if (Object.keys(own).length === 0) {
      const { own: _removed, ...rest } = shot;
      return rest;
    }
    return { ...shot, own };
  });

/** Moves a shot to a position in a scene (its own or another). */
export const moveShot =
  (shotId: string, toSceneId: string, toIndex: number): Edit =>
  (project) => {
    const found = findShot(project, shotId);
    if (!found || !project.scenes.some((scene) => scene.id === toSceneId)) return project;
    if (found.scene.id === toSceneId && found.shotIndex === toIndex) return project;
    const scenes = project.scenes.map((scene) => {
      let shots = scene.shots;
      if (scene.id === found.scene.id) shots = shots.filter((shot) => shot.id !== shotId);
      if (scene.id === toSceneId) {
        shots = [...shots];
        shots.splice(Math.max(0, Math.min(shots.length, toIndex)), 0, found.shot);
      }
      return shots === scene.shots ? scene : { ...scene, shots };
    });
    return { ...project, scenes };
  };

/** Removes the shot. Marks linked to it stay, unlinked. */
export const deleteShot =
  (shotId: string): Edit =>
  (project) => {
    const found = findShot(project, shotId);
    if (!found) return project;
    const unlinked = unlinkShots(project, [found.shot]);
    return updateScene(found.scene.id, (scene) => ({
      ...scene,
      shots: scene.shots.filter((shot) => shot.id !== shotId),
    }))(unlinked);
  };

/**
 * A mark without its shot link. A mark that followed its shot's color keeps
 * that color as its own, so nothing changes on the page except that the
 * shot's caption is gone.
 */
export function unlinkMark<M extends Mark>(project: Project, mark: M, shotColor?: string): M {
  if (mark.kind === "image" || !mark.shotId) return mark;
  const { shotId, ...rest } = mark;
  const color = mark.color ?? shotColor ?? findShot(project, shotId)?.shot.color ?? project.settings.general.newShotColor;
  const next = { ...rest, color } as M;
  if (next.kind === "text" && next.text === undefined) next.text = "";
  return next;
}

/** Unlinks every mark of the given shots. */
function unlinkShots(project: Project, shots: Shot[]): Project {
  const colors = new Map(shots.map((shot) => [shot.id, shot.color]));
  if (colors.size === 0) return project;
  let changed = false;
  const marks = project.marks.map((mark) => {
    if (mark.kind === "image" || !mark.shotId || !colors.has(mark.shotId)) return mark;
    changed = true;
    return unlinkMark(project, mark, colors.get(mark.shotId));
  });
  return changed ? { ...project, marks } : project;
}

/* ---------- marks ---------- */

export const addMarks =
  (marks: Mark[]): Edit =>
  (project) =>
    marks.length === 0 ? project : { ...project, marks: [...project.marks, ...marks] };

export const updateMark =
  (markId: string, recipe: (mark: Mark) => Mark): Edit =>
  (project) => {
    let changed = false;
    const marks = project.marks.map((mark) => {
      if (mark.id !== markId) return mark;
      const next = recipe(mark);
      if (next !== mark) changed = true;
      return next;
    });
    return changed ? { ...project, marks } : project;
  };

export const replaceMark = (mark: Mark): Edit => updateMark(mark.id, () => mark);

export const deleteMarks =
  (markIds: string[]): Edit =>
  (project) => {
    const ids = new Set(markIds);
    const marks = project.marks.filter((mark) => !ids.has(mark.id));
    return marks.length === project.marks.length ? project : { ...project, marks };
  };

export const deleteLinesForShot =
  (shotId: string): Edit =>
  (project) => {
    const marks = project.marks.filter((mark) => !(mark.kind === "line" && mark.shotId === shotId));
    return marks.length === project.marks.length ? project : { ...project, marks };
  };

/** How far a pasted or duplicated mark is nudged so it does not hide the original. */
export const CLONE_NUDGE_PT = 12;

/** A copy with a new ID, optionally on another page and nudged down and right. */
export function cloneMark(mark: Mark, options: { page?: number; nudgePt?: number } = {}): Mark {
  const d = options.nudgePt ?? 0;
  const page = options.page ?? mark.page;
  const base = structuredClone(mark);
  base.id = newId();
  base.page = page;
  if (base.kind === "line") {
    base.points = base.points.map((p) => ({ x: p.x + d, y: p.y + d }));
    delete (base as LineMark).marginContinuation;
  } else {
    base.x += d;
    base.y += d;
  }
  return base;
}
