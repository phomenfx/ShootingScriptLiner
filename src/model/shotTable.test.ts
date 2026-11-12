import { describe, expect, it } from "vitest";
import { createProject, createScene, createShot } from "./defaults";
import { findShot } from "./edits";
import { parseCellBlock, parseMinutes, pasteBlock, TABLE_COLUMNS, tableRows } from "./shotTable";
import type { Project } from "./types";

function sample(): Project {
  const project = createProject();
  const scene = createScene({ indicator: "INT.", location: "KITCHEN", time: "DAY" });
  scene.defaults.movement = ["Sticks"];
  scene.defaults.cameras = [{ name: "A", lenses: ["35mm"] }];
  scene.shots = [
    { ...createShot(project), id: "a", type: "WS", subject: "Kitchen", status: "planned" },
    { ...createShot(project), id: "b", type: "CU", subject: "Alice", status: "cut" },
  ];
  project.scenes = [scene];
  return project;
}

const col = (id: string) => TABLE_COLUMNS.find((c) => c.id === id)!;
const shot = (p: Project, id: string) => findShot(p, id)!;

describe("table cells", () => {
  it("shows scene values dim until the shot has its own, and clearing goes back", () => {
    let p = sample();
    const read = () => col("movement").read(p, p.scenes[0]!, shot(p, "a").shot);
    expect(read()).toMatchObject({ text: "Sticks", inherited: true });
    p = col("movement").write!(p, shot(p, "a").shot, "Dolly; Slider")(p);
    expect(read()).toMatchObject({ text: "Dolly; Slider", inherited: false });
    p = col("movement").write!(p, shot(p, "a").shot, "")(p);
    expect(read().inherited).toBe(true);
  });

  it("edits camera names and lenses by position", () => {
    let p = sample();
    p = col("camera").write!(p, shot(p, "a").shot, "A; B")(p);
    p = col("lens").write!(p, shot(p, "a").shot, "24mm + 50mm; 85mm")(p);
    expect(shot(p, "a").shot.own?.cameras).toEqual([
      { name: "A", lenses: ["24mm", "50mm"] },
      { name: "B", lenses: ["85mm"] },
    ]);
  });

  it("reads minutes and status words", () => {
    expect(parseMinutes("1h 10m")).toBe(70);
    expect(parseMinutes("25")).toBe(25);
    let p = sample();
    p = col("status").write!(p, shot(p, "a").shot, "pickup")(p);
    expect(shot(p, "a").shot.status).toBe("pickup");
  });
});

describe("pasting and filters", () => {
  it("fills right and down from the anchor, skips read-only columns and never adds rows", () => {
    const p = sample();
    // Columns run Shot, Size, Angle, Subject.
    const block = parseCellBlock("MS\tlow\tA\nOTS\thigh\tB\nXX\tC\tD\n");
    const columns = TABLE_COLUMNS.filter((c) => ["shot", "type", "subject", "angle"].includes(c.id));
    const next = pasteBlock(block, ["a", "b"], columns, { shotId: "a", columnId: "type" })(p);
    expect(shot(next, "a").shot).toMatchObject({ type: "MS", subject: "A", angle: "low" });
    expect(shot(next, "b").shot).toMatchObject({ type: "OTS", subject: "B", angle: "high" });
    expect(next.scenes[0]!.shots).toHaveLength(2);
  });

  it("reads quoted cells with tabs and line breaks", () => {
    expect(parseCellBlock('"a\tb"\t"line\nbreak"\n')).toEqual([["a\tb", "line\nbreak"]]);
  });

  it("hides filtered shots and counts them", () => {
    const rows = tableRows(sample(), "", [{ field: "status", not: true, value: "cut" }], TABLE_COLUMNS);
    expect(rows[0]!.shots.map((s) => s.id)).toEqual(["a"]);
    expect(rows[0]!.hiddenByFilter).toBe(1);
    expect(tableRows(sample(), "alice", [], TABLE_COLUMNS)[0]!.shots.map((s) => s.id)).toEqual(["b"]);
  });
});
