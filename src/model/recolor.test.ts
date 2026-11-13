import { describe, expect, it } from "vitest";
import { createProject, createScene, createShot } from "./defaults";
import { recolor } from "./recolor";
import type { Mark } from "./types";

function setup() {
  const project = createProject();
  const scene = createScene();
  scene.shots = [{ ...createShot(project), id: "s1", color: "#000000" }];
  project.scenes = [scene];
  const mark = (id: string, extra: object) => ({ id, kind: "line", page: 1, ...extra }) as unknown as Mark;
  project.marks = [
    mark("locked", { shotId: "s1" }),
    mark("own", { shotId: "s1", color: "#111111" }),
    mark("free", { color: "#222222" }),
    mark("orphan", { shotId: "gone" }),
  ];
  return project;
}
const colorOf = (p: ReturnType<typeof setup>, id: string) => p.marks.find((m) => m.id === id)!.color;

describe("recolor", () => {
  it("recolors the shot when the mark's color is locked to it", () => {
    const next = recolor(setup(), { kind: "mark", ids: ["locked"] }, "#FF0000");
    expect(next.scenes[0]!.shots[0]!.color).toBe("#FF0000");
    expect(colorOf(next, "locked")).toBeUndefined();
    expect(colorOf(next, "own")).toBe("#111111");
  });

  it("changes the mark's own color when unlocked, unlinked, or its shot is gone", () => {
    const next = recolor(setup(), { kind: "mark", ids: ["own", "free", "orphan"] }, "#00FF00");
    expect(next.scenes[0]!.shots[0]!.color).toBe("#000000");
    expect(["own", "free", "orphan"].map((id) => colorOf(next, id))).toEqual(["#00FF00", "#00FF00", "#00FF00"]);
  });
});
