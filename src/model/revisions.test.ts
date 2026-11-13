import { describe, expect, it } from "vitest";
import { createProject, createScene, createShot } from "./defaults";
import { clearRevisionTags, stampRevisions } from "./revisions";
import type { Mark, Project } from "./types";

function setup(enabled: boolean): Project {
  const p = createProject();
  p.settings.revisions = { enabled, current: "blue" };
  const scene = createScene();
  scene.shots = [{ ...createShot(p), id: "a" }, { ...createShot(p), id: "b" }];
  p.scenes = [scene];
  p.marks = [{ id: "m", kind: "line", page: 1, shotId: "b", points: [] } as unknown as Mark];
  return p;
}
const tags = (p: Project) => p.scenes[0]!.shots.map((s) => s.revision ?? "-");

describe("revision tags", () => {
  it("tag changed shots, and shots whose marks changed, with the current revision", () => {
    const p = setup(true);
    const edited = { ...p, scenes: [{ ...p.scenes[0]!, shots: [{ ...p.scenes[0]!.shots[0]!, subject: "New" }, p.scenes[0]!.shots[1]!] }] };
    expect(tags(stampRevisions(p, edited))).toEqual(["blue", "-"]);
    const moved = { ...p, marks: [{ ...p.marks[0]!, page: 2 } as Mark] };
    expect(tags(stampRevisions(p, moved))).toEqual(["-", "blue"]);
  });

  it("ignore hiding and renumbering, and do nothing while off", () => {
    const p = setup(true);
    const hidden = { ...p, scenes: [{ ...p.scenes[0]!, shots: [{ ...p.scenes[0]!.shots[0]!, visible: false, number: "C" }, p.scenes[0]!.shots[1]!] }] };
    expect(tags(stampRevisions(p, hidden))).toEqual(["-", "-"]);
    const off = setup(false);
    const edited = { ...off, scenes: [{ ...off.scenes[0]!, shots: [{ ...off.scenes[0]!.shots[0]!, subject: "New" }, off.scenes[0]!.shots[1]!] }] };
    expect(stampRevisions(off, edited)).toBe(edited);
  });

  it("can all be cleared", () => {
    const p = setup(true);
    p.scenes[0]!.shots[0]!.revision = "pink";
    expect(tags(clearRevisionTags(p))).toEqual(["-", "-"]);
  });
});
