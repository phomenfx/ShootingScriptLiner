/*
 * Recoloring follows the same lock rule as other fields: a mark whose color is
 * locked to its shot recolors the shot (and with it every mark that follows it);
 * an unlocked mark, or one with no shot, changes its own color.
 */
import * as edits from "./edits";
import type { Project } from "./types";

export type RecolorTarget = { kind: "scene" | "shot" | "mark"; ids: string[] };

export function recolor(project: Project, target: RecolorTarget, color: string): Project {
  const ids = new Set(target.ids);
  if (target.kind === "shot") {
    let next = project;
    for (const id of ids) next = edits.updateShot(id, (shot) => ({ ...shot, color }))(next);
    return next;
  }
  if (target.kind === "scene") {
    // A scene has no color of its own; its shots take it.
    return { ...project, scenes: project.scenes.map((scene) => (ids.has(scene.id) ? { ...scene, shots: scene.shots.map((shot) => ({ ...shot, color })) } : scene)) };
  }
  const shotIds = new Set<string>();
  const markIds = new Set<string>();
  for (const mark of project.marks) {
    if (!ids.has(mark.id) || mark.kind === "image") continue;
    if (mark.color === undefined && edits.findShot(project, mark.shotId)) shotIds.add(mark.shotId!);
    else markIds.add(mark.id);
  }
  let next = recolor(project, { kind: "shot", ids: [...shotIds] }, color);
  for (const id of markIds) next = edits.updateMark(id, (mark) => (mark.kind === "image" ? mark : { ...mark, color }))(next);
  return next;
}
