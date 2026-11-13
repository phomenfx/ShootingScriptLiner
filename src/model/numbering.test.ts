import { describe, expect, it } from "vitest";
import { createProject, createScene } from "./defaults";
import { clearShotNumbers, renumberScene, renumberShot, sceneNumbers, shotNumber } from "./numbering";
import type { Project, Shot } from "./types";

const shot = (id: string, number?: string): Shot => ({ id, color: "#000000", visible: true, status: "planned", priority: "nice", ...(number ? { number } : {}) });

function project(...scenes: string[][]): Project {
  const p = createProject();
  p.scenes = scenes.map((ids, i) => ({ ...createScene(), id: `scene${i + 1}`, shots: ids.map((id) => shot(id)) }));
  return p;
}
const labels = (p: Project) => p.scenes.flatMap((s, i) => s.shots.map((sh, j) => `${sh.id}=${shotNumber(p, i, j)}`));
const done = (r: ReturnType<typeof renumberShot>) => {
  if (r.kind !== "done") throw new Error(r.kind);
  return r.project;
};

describe("numbers", () => {
  it("count on from a typed number, so gaps and inserts work", () => {
    const p = project(["a", "b"], ["c"], ["d"]);
    p.scenes[0]!.shots[0]!.number = "C";
    p.scenes[1]!.number = "1A";
    expect(sceneNumbers(p)).toEqual(["1", "1A", "2"]);
    expect(labels(p)).toEqual(["a=1C", "b=1D", "c=1AA", "d=2A"]);
  });

  it("moves a shot to a free number in order, leaving the others as they were", () => {
    const p = done(renumberShot(project(["a", "b", "c"]), "a", "", "D", true));
    expect(labels(p)).toEqual(["b=1B", "c=1C", "a=1D"]);
  });

  it("swaps with a shot that has the number, or reports it", () => {
    const p = project(["a", "b", "c"]);
    expect(labels(done(renumberShot(p, "a", "", "C", true)))).toEqual(["c=1A", "b=1B", "a=1C"]);
    expect(renumberShot(p, "a", "", "C", false)).toMatchObject({ kind: "taken", shotId: "c" });
  });

  it("moves a shot to another scene", () => {
    const p = done(renumberShot(project(["a", "b"], ["c"]), "a", "2", "", true));
    expect(labels(p)).toEqual(["b=1B", "c=2A", "a=2B"]);
    expect(renumberShot(p, "a", "9", "", true).kind).toBe("error");
  });

  it("renumbers a scene into order, and swaps with a taken number", () => {
    const moved = renumberScene(project(["a"], ["b"], ["c"]), "scene1", "5");
    expect(moved.kind === "done" && moved.project.scenes.map((s) => s.id)).toEqual(["scene2", "scene3", "scene1"]);
    const swapped = renumberScene(project(["a"], ["b"]), "scene1", "2");
    expect(swapped.kind === "done" && swapped.project.scenes.map((s) => `${s.id}=${s.number}`)).toEqual(["scene2=1", "scene1=2"]);
  });

  it("can go back to counting by position", () => {
    const p = done(renumberShot(project(["a", "b", "c"]), "a", "", "D", true));
    expect(labels(clearShotNumbers(p, "scene1"))).toEqual(["b=1A", "c=1B", "a=1C"]);
  });
});

describe("switching letters and numbers", () => {
  it("converts typed shot numbers", async () => {
    const { setShotIdStyle } = await import("./numbering");
    const p = done(renumberShot(project(["a", "b"]), "a", "", "D", true));
    const next = setShotIdStyle(p, "decimal");
    expect(labels(next)).toEqual(["b=1.2", "a=1.4"]);
  });
});
