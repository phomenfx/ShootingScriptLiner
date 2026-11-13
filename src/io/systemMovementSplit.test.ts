import { describe, expect, it } from "vitest";
import { createProject, createScene, createShot } from "../model/defaults";
import { readProjectJson } from "./readProject";
import { serializeProject } from "./writeProject";

/** A save with Sticks as the scene's value and Steadicam on the shot, in the field named "movement". */
function save(revision: number | undefined): string {
  const p = createProject();
  const scene = createScene();
  scene.defaults.movement = ["Sticks"];
  const shot = { ...createShot(p), own: { movement: ["Steadicam"] }, print: { movement: true } };
  scene.shots = [shot];
  p.scenes = [scene];
  p.settings.importMapping = { rig: "movement" };
  const raw = JSON.parse(serializeProject(p));
  if (revision === undefined) delete raw.dataRevision;
  else raw.dataRevision = revision;
  return JSON.stringify(raw);
}

describe("System and Movement split", () => {
  it("moves System/Movement from older saves into System, with Movement empty", () => {
    const { project } = readProjectJson(save(undefined));
    const scene = project.scenes[0]!;
    expect(scene.defaults.system).toEqual(["Sticks"]);
    expect(scene.defaults.movement).toEqual([]);
    expect(scene.shots[0]!.own).toEqual({ system: ["Steadicam"] });
    expect(scene.shots[0]!.print).toEqual({ system: true });
    expect(project.settings.importMapping).toEqual({ rig: "system" });
    const ids = project.settings.captions.fields.map((f) => f.id);
    expect(ids.indexOf("movement")).toBe(ids.indexOf("system") - 1);
    expect(project.dataRevision).toBe(1);
  });

  it("leaves newer saves as they are", () => {
    const { project } = readProjectJson(save(1));
    expect(project.scenes[0]!.defaults.movement).toEqual(["Sticks"]);
    expect(project.scenes[0]!.defaults.system).toEqual([]);
    expect(project.scenes[0]!.shots[0]!.own).toEqual({ movement: ["Steadicam"] });
  });
});
