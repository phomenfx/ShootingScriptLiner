/*
 * Copying, pasting and duplicating shots and scenes in the Scenes list.
 * Copies take the shot or scene settings only. Lines and notes stay where they
 * are on the script, linked to the original.
 */
import { newId } from "../lib/ids";
import { findShot } from "./edits";
import type { Project, Scene, Shot } from "./types";

export type OutlineClip = { kind: "shots"; shots: Shot[] } | { kind: "scenes"; scenes: Scene[] };

/** Where a paste lands: after the selected shot or scene, or at the end. */
export type OutlineAnchor = { kind: "shot" | "scene"; id: string } | null;

export function cloneShot(shot: Shot): Shot {
  return { ...structuredClone(shot), id: newId() };
}

export function cloneScene(scene: Scene): Scene {
  return { ...structuredClone(scene), id: newId(), shots: scene.shots.map(cloneShot) };
}

/** The clip for the selected shots or scenes, in list order. */
export function outlineClipOf(project: Project, kind: "shot" | "scene", ids: string[]): OutlineClip | null {
  if (kind === "scene") {
    const scenes = project.scenes.filter((scene) => ids.includes(scene.id));
    return scenes.length > 0 ? { kind: "scenes", scenes: structuredClone(scenes) } : null;
  }
  const shots = project.scenes.flatMap((scene) => scene.shots).filter((shot) => ids.includes(shot.id));
  return shots.length > 0 ? { kind: "shots", shots: structuredClone(shots) } : null;
}

/**
 * Inserts fresh copies of the clip. Shots go after the anchor shot, or at the
 * end of the anchor scene, or at the end of the last scene. Scenes go after the
 * anchor's scene, or at the end. Returns the new ids, or none when there is
 * nowhere to put shots.
 */
export function insertOutline(project: Project, clip: OutlineClip, anchor: OutlineAnchor): { project: Project; ids: string[] } {
  if (clip.kind === "scenes") {
    const copies = clip.scenes.map(cloneScene);
    const sceneId = anchor?.kind === "scene" ? anchor.id : anchor ? findShot(project, anchor.id)?.scene.id : undefined;
    const at = sceneId ? project.scenes.findIndex((scene) => scene.id === sceneId) + 1 : project.scenes.length;
    const scenes = [...project.scenes];
    scenes.splice(at > 0 ? at : scenes.length, 0, ...copies);
    return { project: { ...project, scenes }, ids: copies.map((scene) => scene.id) };
  }

  const copies = clip.shots.map(cloneShot);
  let sceneIndex = project.scenes.length - 1;
  let at: number | undefined;
  if (anchor?.kind === "shot") {
    const found = findShot(project, anchor.id);
    if (found) {
      sceneIndex = found.sceneIndex;
      at = found.shotIndex + 1;
    }
  } else if (anchor?.kind === "scene") {
    const index = project.scenes.findIndex((scene) => scene.id === anchor.id);
    if (index >= 0) sceneIndex = index;
  }
  const target = project.scenes[sceneIndex];
  if (!target) return { project, ids: [] };
  const shots = [...target.shots];
  shots.splice(at ?? shots.length, 0, ...copies);
  const scenes = project.scenes.map((scene, index) => (index === sceneIndex ? { ...scene, shots } : scene));
  return { project: { ...project, scenes }, ids: copies.map((shot) => shot.id) };
}
