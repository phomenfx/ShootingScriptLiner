import { describe, expect, it } from "vitest";
import { buildShotListRows, rowsToCsv } from "../io/shotListCsv";
import { createProject, createScene, createShot } from "./defaults";
import { matchHeader, parseTable, planImport, type ImportField } from "./shotImport";
import type { Project } from "./types";

const plan = (project: Project, text: string, mode: "update" | "add" = "update") => {
  const rows = parseTable(text);
  const mapping: ImportField[] = rows[0]!.map(matchHeader);
  return planImport(project, rows, mapping, mode);
};

describe("matching columns", () => {
  it("knows common header names and skips the rest", () => {
    expect(["Scene #", "Type", "Talent", "Day Scheduled", "Lens", "Whatever"].map(matchHeader)).toEqual(["scene", "type", "cast", "date", "lens", "skip"]);
  });
});

describe("importing rows", () => {
  it("joins rows to scenes by number, fills a blank scene cell from above, and makes missing scenes", () => {
    const text = "Scene,Shot,Size,Subject,Status,Priority\n2,A,WS,Kitchen,done,high\n,B,CU,Alice,,low\n";
    const result = plan(createProject(), text);
    expect(result).toMatchObject({ newScenes: 2, newShots: 2, updatedShots: 0 });
    const shots = result.project.scenes[1]!.shots;
    expect(shots.map((s) => [s.type, s.subject, s.status, s.priority])).toEqual([
      ["WS", "Kitchen", "shot", "must"],
      ["CU", "Alice", "planned", "low"],
    ]);
  });

  it("updates shots with the same scene and shot ID, adds the rest, and never deletes", () => {
    const project = createProject();
    const scene = createScene({ indicator: "INT.", location: "KITCHEN", time: "DAY" });
    scene.shots = [{ ...createShot(project), type: "WS", subject: "Old" }, { ...createShot(project), type: "MS" }];
    project.scenes = [scene];
    const result = plan(project, "Scene\tShot\tSubject\n1\t1A\tNew\n1\t1C\tAdded\n");
    expect(result).toMatchObject({ updatedShots: 1, newShots: 1, newScenes: 0 });
    expect(result.project.scenes[0]!.shots.map((s) => s.subject)).toEqual(["New", undefined, "Added"]);
    expect(plan(project, "Scene\tShot\tSubject\n1\t1A\tNew\n", "add").project.scenes[0]!.shots).toHaveLength(3);
  });

  it("keeps a value inherited when it matches the scene", () => {
    const project = createProject();
    const scene = createScene({ indicator: "INT.", location: "KITCHEN", time: "DAY" });
    scene.defaults.audio = ["Boom"];
    project.scenes = [scene];
    const shot = plan(project, "Scene,Shot,Audio,Location\n1,A,Boom,PANTRY\n").project.scenes[0]!.shots[0]!;
    expect(shot.own?.audio).toBeUndefined();
    expect(shot.own?.location).toBe("PANTRY");
  });

  it("reads back its own CSV export", () => {
    const project = createProject();
    const scene = createScene({ indicator: "INT.", location: "KITCHEN", time: "DAY" });
    scene.shots = [
      { ...createShot(project), type: "WS", subject: "Kitchen", cast: ["Alice", "Ben"], estimatedMinutes: 20, status: "shot" },
      { ...createShot(project), type: "CU", subject: "Alice", own: { cameras: [{ name: "A", lenses: ["85mm"] }] } },
    ];
    project.scenes = [scene, createScene({ indicator: "EXT.", location: "STREET", time: "NIGHT" })];
    const csv = rowsToCsv(buildShotListRows(project));
    const result = plan(createProject(), csv);
    expect(result.project.scenes.map((s) => s.heading.location)).toEqual(["KITCHEN", "STREET"]);
    const shots = result.project.scenes[0]!.shots;
    expect(shots.map((s) => [s.type, s.subject, s.cast, s.estimatedMinutes, s.status])).toEqual([
      ["WS", "Kitchen", ["Alice", "Ben"], 20, "shot"],
      ["CU", "Alice", undefined, undefined, "planned"],
    ]);
    expect(shots[1]!.own?.cameras).toEqual([{ name: "A", lenses: ["85mm"] }]);
  });
});
