import { describe, expect, it } from "vitest";
import { createProject, createScene, createShot } from "./defaults";
import { insertOutline, outlineClipOf } from "./outlineClipboard";
import type { Project } from "./types";

function sample(): Project {
  const project = createProject();
  const one = createScene({ indicator: "INT.", location: "KITCHEN", time: "DAY" });
  const two = createScene({ indicator: "EXT.", location: "STREET", time: "NIGHT" });
  one.shots = [
    { ...createShot(project), id: "a", type: "WS" },
    { ...createShot(project), id: "b", type: "CU", own: { location: "PANTRY" } },
  ];
  two.shots = [{ ...createShot(project), id: "c", type: "MS" }];
  one.id = "one";
  two.id = "two";
  project.scenes = [one, two];
  return project;
}

const types = (p: Project, sceneIndex: number) => p.scenes[sceneIndex]!.shots.map((shot) => shot.type);

describe("copying shots and scenes", () => {
  it("puts a copied shot after the selected shot, with a new id and the same settings", () => {
    const p = sample();
    const clip = outlineClipOf(p, "shot", ["b"])!;
    const { project, ids } = insertOutline(p, clip, { kind: "shot", id: "a" });
    expect(types(project, 0)).toEqual(["WS", "CU", "CU"]);
    const copy = project.scenes[0]!.shots[1]!;
    expect(copy.id).toBe(ids[0]);
    expect(copy.id).not.toBe("b");
    expect(copy.own).toEqual({ location: "PANTRY" });
  });

  it("puts shots at the end of a selected scene, or of the last scene", () => {
    const p = sample();
    const clip = outlineClipOf(p, "shot", ["a"])!;
    expect(types(insertOutline(p, clip, { kind: "scene", id: "one" }).project, 0)).toEqual(["WS", "CU", "WS"]);
    expect(types(insertOutline(p, clip, null).project, 1)).toEqual(["MS", "WS"]);
    expect(insertOutline({ ...p, scenes: [] }, clip, null).ids).toEqual([]);
  });

  it("copies a scene with its shots after the selected scene", () => {
    const p = sample();
    const clip = outlineClipOf(p, "scene", ["one"])!;
    const { project } = insertOutline(p, clip, { kind: "shot", id: "c" });
    expect(project.scenes.map((scene) => scene.heading.location)).toEqual(["KITCHEN", "STREET", "KITCHEN"]);
    const copy = project.scenes[2]!;
    expect(copy.id).not.toBe("one");
    expect(copy.shots.map((shot) => shot.type)).toEqual(["WS", "CU"]);
    expect(copy.shots.some((shot) => shot.id === "a" || shot.id === "b")).toBe(false);
  });
});
