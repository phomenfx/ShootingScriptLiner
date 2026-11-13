import { describe, expect, it } from "vitest";
import { createProject, createScene } from "./defaults";
import { lineCountsByShot, listScenes, nextPriority, nextStatus, shotIdLabel } from "./shotList";
import type { Project, Shot } from "./types";

function shot(id: string, extra: Partial<Shot> = {}): Shot {
  return { id, color: "#FF0000", visible: true, status: "planned", priority: "nice", ...extra };
}

function sample(): Project {
  const project = createProject();
  const kitchen = createScene({ indicator: "INT.", location: "KITCHEN", time: "DAY" });
  kitchen.shots = [shot("a", { type: "WS", subject: "Kitchen" }), shot("b", { type: "CU", subject: "Alice", tags: ["vfx"] })];
  const hall = createScene({ indicator: "INT.", location: "HALL", time: "NIGHT" });
  hall.shots = [shot("c", { type: "WS", subject: "Alice", additionalInfo: "Moving" })];
  project.scenes = [kitchen, hall, createScene()];
  return project;
}

describe("shotList", () => {
  it("builds shot IDs from position in either style", () => {
    const p = createProject();
    p.scenes = [createScene(), createScene()];
    p.scenes[1]!.shots = Array.from({ length: 28 }, (_, i) => shot(`s${i}`));
    p.scenes[0]!.shots = [shot("a")];
    expect(shotIdLabel(p, 0, 0)).toBe("1A");
    expect(shotIdLabel(p, 1, 27)).toBe("2AB");
    p.settings.general.shotIdStyle = "decimal";
    expect(shotIdLabel(p, 1, 2)).toBe("2.3");
  });

  it("cycles status and priority, and starts over from an unknown key", () => {
    const lists = createProject().settings.lists;
    expect(["planned", "shot", "pickup", "cut"].map((k) => nextStatus(k, lists))).toEqual(["shot", "pickup", "cut", "planned"]);
    expect(["nice", "must", "low"].map((k) => nextPriority(k, lists))).toEqual(["must", "low", "nice"]);
    expect(nextStatus("mystery", lists)).toBe("planned");
    expect(nextStatus("cut", { status: [{ key: "custom:reshoot", label: "Reshoot" }] })).toBe("custom:reshoot");
  });

  it("lists every scene and shot with its ID when there is no search", () => {
    const listed = listScenes(sample());
    expect(listed.map((l) => l.shots.map((s) => s.id))).toEqual([["1A", "1B"], ["2A"], []]);
  });

  it("searches shot text, IDs and tags, and drops scenes with nothing to show", () => {
    const project = sample();
    const ids = (query: string) => listScenes(project, query).flatMap((l) => l.shots.map((s) => s.id));
    expect(ids("alice")).toEqual(["1B", "2A"]);
    expect(ids("2a")).toEqual(["2A"]);
    expect(ids("VFX")).toEqual(["1B"]);
    expect(ids("moving")).toEqual(["2A"]);
    expect(listScenes(project, "zzz")).toEqual([]);
  });

  it("a scene whose heading matches keeps all of its shots", () => {
    const listed = listScenes(sample(), "kitchen");
    expect(listed).toHaveLength(1);
    expect(listed[0]!.shots.map((s) => s.id)).toEqual(["1A", "1B"]);
  });

  it("counts lines per shot", () => {
    const project = sample();
    const line = (id: string, shotId?: string) =>
      ({ id, kind: "line", page: 1, shotId, points: [], stroke: { pattern: "straight", widthPt: 2 } }) as never;
    project.marks = [line("l1", "a"), line("l2", "a"), line("l3", "c"), line("l4")];
    expect([...lineCountsByShot(project)]).toEqual([["a", 2], ["c", 1]]);
  });
});
