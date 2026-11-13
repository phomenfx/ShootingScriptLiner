import { describe, expect, it } from "vitest";
import { createProject, createScene, createShot } from "./defaults";
import { markAsDefaults } from "./markDefaults";
import { scenePage, type FoundHeading } from "./sceneDetect";
import { guessMapping, rememberMapping } from "./shotImport";
import { groupByDate, tableRows } from "./shotTable";
import type { LineMark, Project, SceneHeading, ShapeMark } from "./types";

const heading = (indicator: string, location: string, time = ""): SceneHeading => ({ indicator, location, time });

function project(): Project {
  const p = createProject();
  const a = { ...createScene(), heading: heading("INT.", "KITCHEN", "DAY"), defaults: { ...createScene().defaults, date: "2026-03-02" } };
  const b = { ...createScene(), heading: heading("EXT.", "PARK", "NIGHT") };
  const s1 = createShot(p);
  const s2 = { ...createShot(p), own: { date: "2026-03-01" } };
  const s3 = createShot(p);
  a.shots = [s1, s2];
  b.shots = [s3];
  return { ...p, scenes: [a, b] };
}

describe("group by date", () => {
  it("groups by the shot's own date or its scene's, earliest first, undated last", () => {
    const p = project();
    const groups = groupByDate(tableRows(p, "", [], []));
    expect(groups.map((g) => [g.date, g.items.length])).toEqual([
      ["2026-03-01", 1],
      ["2026-03-02", 1],
      ["", 1],
    ]);
    expect(groups[2]!.items[0]!.scene.id).toBe(p.scenes[1]!.id);
  });
});

describe("scene page", () => {
  const found: FoundHeading[] = [
    { number: 1, heading: heading("INT.", "KITCHEN", "DAY"), page: 2 },
    { number: 2, heading: heading("EXT.", "PARK", "NIGHT"), page: 5 },
  ];
  it("finds a scene by its heading text", () => {
    expect(scenePage(project(), 1, found)).toBe(5);
  });
  it("falls back to the scene number when the heading was retyped", () => {
    const p = project();
    p.scenes[0] = { ...p.scenes[0]!, heading: heading("INT.", "KITCHEN (LATER)") };
    expect(scenePage(p, 0, found)).toBe(2);
  });
  it("gives nothing when the script has no headings", () => {
    expect(scenePage(project(), 0, [])).toBeUndefined();
  });
});

describe("import mapping memory", () => {
  it("remembers only choices that differ from the best match, and reuses them", () => {
    const header = ["Scene", "Shot", "Lens choice"];
    const guessed = guessMapping(header);
    expect(guessed[2]).toBe("skip");
    const chosen = [guessed[0]!, guessed[1]!, "lens" as const];
    const saved = rememberMapping({}, header, chosen);
    expect(saved).toEqual({ "lens choice": "lens" });
    expect(guessMapping(["  LENS   choice "], saved)).toEqual(["lens"]);
    // Going back to the best match forgets it.
    expect(rememberMapping(saved, header, guessed)).toEqual({});
  });
});

describe("set as default", () => {
  it("copies a line's style and outlines", () => {
    const p = createProject();
    const d = p.settings.markDefaults.line;
    const line: LineMark = {
      id: "l",
      kind: "line",
      page: 1,
      points: [],
      stroke: { pattern: "wavy", widthPt: 3 },
      start: { type: "arrow", sizePct: 150, filled: true },
      end: d.end,
      outline: { color: "#ffffff", widthPt: 2 },
      caption: { ...d.caption, show: true, sizePt: 14, outline: { color: "#000000", widthPt: 1 } },
    };
    const s = markAsDefaults(p.settings, line);
    expect(s.markDefaults.line.stroke).toEqual({ pattern: "wavy", widthPt: 3 });
    expect(s.markDefaults.line.start.type).toBe("arrow");
    expect(s.markDefaults.line.outline).toEqual({ color: "#ffffff", widthPt: 2 });
    expect(s.markDefaults.line.captionOutline).toEqual({ color: "#000000", widthPt: 1 });
    expect(s.markDefaults.line.caption).not.toHaveProperty("show");
    expect(s.markDefaults.text.style.sizePt).toBe(14);
  });

  it("a highlight only sets the highlight color", () => {
    const p = createProject();
    const hl: ShapeMark = { id: "h", kind: "shape", page: 1, shape: "highlight", x: 0, y: 0, widthPt: 10, heightPt: 10, rotation: 0, color: "#00ff00" };
    const s = markAsDefaults(p.settings, hl);
    expect(s.markDefaults.shape).toEqual({ ...p.settings.markDefaults.shape, highlightColor: "#00ff00" });
  });
});
