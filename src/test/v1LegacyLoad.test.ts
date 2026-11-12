/**
 * Safety net for the version 2 rework (build step 1).
 * Pins how today's app reads version 1 saves, so the version 1 migration
 * can be checked against the same expectations.
 *
 * The committed fixture is invented data. A second block reads the real
 * local saves in `local-fixtures/` when they exist; those files are private and
 * git-ignored, so that block skips everywhere else.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { formatShotLabel, parseProject, serializeProject } from "../lib/labelUtils";
import { DEFAULT_LINE_LABEL_FIELDS, DEFAULT_SCHEDULED_DATE_FORMAT } from "../types/lineLabelFields";
import type { LineAnnotation, Project } from "../types/project";
import type { TextAnnotation } from "../types/annotations";

function loadFixture(): Project {
  const path = fileURLToPath(new URL("./fixtures/v1-legacy-project.json", import.meta.url));
  return parseProject(readFileSync(path, "utf8"));
}

function line(project: Project, id: string): LineAnnotation {
  const a = project.annotations.find((x) => x.id === id);
  if (!a || a.kind !== "line") throw new Error(`no line ${id}`);
  return a;
}

function note(project: Project, id: string): TextAnnotation {
  const a = project.annotations.find((x) => x.id === id);
  if (!a || a.kind !== "text") throw new Error(`no note ${id}`);
  return a;
}

describe("version 1 load: invented legacy fixture", () => {
  const project = loadFixture();

  it("keeps project settings and fills in missing ones", () => {
    expect(project.version).toBe(1);
    expect(project.name).toBe("Fixture Film");
    expect(project.labelMode).toBe("letter");
    expect(project.additionalInfoStyle).toBe("parens");
    expect(project.defaultShotColor).toBe("#FF0000");
    expect(project.inheritLineFromPrevious).toBe(false);
    expect(project.labelOffsetXPt).toBe(3);
    expect(project.labelOffsetYPt).toBe(4);
    expect(project.labelSecondaryGapPt).toBe(4);
    expect(project.scriptFileName).toBe("fixture-script.pdf");
    expect(project.scheduledDateFormat).toBe(DEFAULT_SCHEDULED_DATE_FORMAT);
    expect(project.lineLabelFields).toEqual(DEFAULT_LINE_LABEL_FIELDS);
  });

  it("turns the old snapLineAngles switch into an angle", () => {
    expect(project.snapAngleDegrees).toBe(0);
  });

  it("moves the old project-level labelBold and cap names into the line defaults", () => {
    expect(project.defaultLine).toMatchObject({
      stroke: "solid",
      widthPt: 2,
      fontFamily: '"Arial", sans-serif',
      fontSizePt: 11,
      labelBold: false,
      // An old cap name with no ending record loads as not filled.
      start: { cap: "none", scalePercent: 100, filled: false },
      end: { cap: "arrow", scalePercent: 100, filled: true },
    });
  });

  it("sorts scenes and shots by their saved order and renumbers them", () => {
    expect(project.scenes.map((s) => [s.id, s.order])).toEqual([
      ["scene-kitchen", 0],
      ["scene-garage", 1],
      ["scene-empty", 2],
    ]);
    const kitchen = project.scenes[0]!;
    expect(kitchen.shots.map((s) => [s.id, s.order])).toEqual([
      ["shot-kitchen-ws", 0],
      ["shot-kitchen-cu", 1],
    ]);
    expect(project.scenes[2]!.visible).toBe(false);
  });

  it("splits sluglines into indicator, location and time", () => {
    const [kitchen, garage, empty] = project.scenes;
    expect(kitchen).toMatchObject({
      slugline: "INT. KITCHEN - DAY",
      indicator: "INT.",
      location: "KITCHEN",
      timeOfDay: "DAY",
    });
    expect(garage).toMatchObject({
      slugline: "EXT. GARAGE - NIGHT",
      indicator: "EXT.",
      location: "GARAGE",
      timeOfDay: "NIGHT",
    });
    expect(empty!.slugline).toBe("");
    expect(empty!.indicator).toBeUndefined();
  });

  it("keeps scene defaults and shot values as saved", () => {
    const kitchen = project.scenes[0]!;
    expect(kitchen).toMatchObject({
      cameraSupport: "Tripod",
      lens: "35mm",
      audioSource: "Boom",
      camera: "A",
      fps: "24",
      sync: "SYNC",
      scheduledDate: "2026-03-14",
    });
    const [ws, cu] = kitchen.shots;
    expect(ws).toEqual({
      id: "shot-kitchen-ws",
      order: 0,
      color: "#FF0000",
      visible: true,
      shotType: "WS",
      subject: "Kitchen",
      slug: "",
    });
    expect(cu).toMatchObject({
      color: "#3366FF",
      shotType: "CU",
      subject: "Robin",
      slug: "Pouring tea",
      lens: "85mm",
      notes: "Rack focus to the cup",
    });
    expect(cu!.sync).toBeUndefined();
    expect(project.scenes[1]!.shots[0]).toMatchObject({ lens: "24mm", sync: "MOS" });
  });

  it("works out shot IDs from position", () => {
    const { scenes } = project;
    const label = (sceneIdx: number, shotIdx: number, mode: "letter" | "decimal" = "letter") =>
      formatShotLabel(scenes[sceneIdx]!, scenes[sceneIdx]!.shots[shotIdx]!, scenes, mode);
    expect(label(0, 0)).toBe("1A-WS Kitchen");
    expect(label(0, 1)).toBe("1B-CU Robin (Pouring tea)");
    expect(label(1, 0)).toBe("2A-WS Master");
    expect(label(0, 1, "decimal")).toBe("1.2-CU Robin (Pouring tea)");
  });

  it("drops old continuation segments and keeps every other mark in order", () => {
    expect(project.annotations.map((a) => a.id)).toEqual([
      "line-linked",
      "line-custom-caption",
      "line-unlinked-legacy-style",
      "line-continues",
      "note-plain",
      "note-follows-shot",
    ]);
  });

  it("reads a fully linked line", () => {
    expect(line(project, "line-linked")).toEqual({
      id: "line-linked",
      kind: "line",
      page: 1,
      points: [
        { x: 0.1, y: 0.2 },
        { x: 0.1, y: 0.6 },
      ],
      style: {
        stroke: "solid",
        widthPt: 2,
        color: "#FF0000",
        start: { cap: "none", scalePercent: 100, filled: true },
        end: { cap: "arrow", scalePercent: 100, filled: true },
      },
      fontFamily: '"Arial", sans-serif',
      fontSizePt: 11,
      labelBold: true,
      shotId: "shot-kitchen-ws",
      showLabel: true,
      locks: { shotId: true, shotType: true, label: true, color: true },
    });
  });

  it("reads a linked line with its own caption and color", () => {
    const l = line(project, "line-custom-caption");
    expect(l.shotId).toBe("shot-kitchen-cu");
    expect(l.label).toBe("Robin's hands only");
    expect(l.locks).toEqual({ shotId: true, shotType: true, label: false, color: false });
    expect(l.style).toEqual({
      stroke: "dashed_4_3_2_3",
      widthPt: 3,
      color: "#8800CC",
      start: { cap: "circle", scalePercent: 150, filled: false },
      end: { cap: "slash", scalePercent: 100, filled: true },
    });
    expect(l.fontFamily).toBe('"Consolas", monospace');
    expect(l.fontSizePt).toBe(9);
    expect(l.labelBold).toBe(false);
  });

  it("upgrades an old-style unlinked line (width 1-3, startCap/endCap, no fonts or locks)", () => {
    const l = line(project, "line-unlinked-legacy-style");
    expect(l.shotId).toBeUndefined();
    expect(l.showLabel).toBe(false);
    expect(l.locks).toEqual({ shotId: false, shotType: false, label: false, color: false });
    expect(l.style.stroke).toBe("dotted");
    expect(l.style.widthPt).toBe(3);
    expect(l.style.color).toBe("#111111");
    expect(l.style.start.cap).toBe("none");
    expect(l.style.end.cap).toBe("diamond");
    expect(l.fontFamily).toBe('"Arial", sans-serif');
    expect(l.fontSizePt).toBe(11);
    // No labelBold on the line: it takes the project default (false in this file).
    expect(l.labelBold).toBe(false);
  });

  it("turns continuesToNextPage into a bottom margin continuation", () => {
    const l = line(project, "line-continues");
    expect(l.marginContinuation).toBe("bottom");
    expect(l.locks).toEqual({ shotId: true, shotType: true, label: true, color: true });
    expect(l.points).toEqual([
      { x: 0.2, y: 0.5 },
      { x: 0.2, y: 0.97 },
    ]);
  });

  it("reads text notes, including the old bold name and shot-following notes", () => {
    expect(note(project, "note-plain")).toEqual({
      id: "note-plain",
      kind: "text",
      page: 1,
      x: 0.4,
      y: 0.3,
      text: "Check props",
      color: "#111111",
      fontSize: 14,
      fontFamily: '"Courier New", monospace',
      labelBold: true,
    });
    expect(note(project, "note-follows-shot")).toEqual({
      id: "note-follows-shot",
      kind: "text",
      page: 2,
      x: 0.3,
      y: 0.7,
      text: "stale copy",
      color: "#3366FF",
      fontSize: 11,
      fontFamily: '"Arial", sans-serif',
      labelBold: false,
      shotId: "shot-kitchen-cu",
      followShot: true,
      locks: { shotId: true, color: true },
    });
  });

  it("survives a save and reopen without changing", () => {
    expect(parseProject(serializeProject(project))).toEqual(
      // Saving writes only known project fields, so the old names are gone after one round trip.
      parseProject(serializeProject(parseProject(serializeProject(project))))
    );
    const again = parseProject(serializeProject(project));
    expect(again.scenes).toEqual(project.scenes);
    expect(again.annotations).toEqual(project.annotations);
    expect(again.snapAngleDegrees).toBe(0);
    expect(again.defaultLine.labelBold).toBe(false);
  });

  it("refuses other versions", () => {
    expect(() => parseProject(JSON.stringify({ version: 2 }))).toThrow(
      "Unsupported project version"
    );
  });
});

/** Private saves on the author's machine. Never committed; skipped when absent. */
const LOCAL_SAVES: { file: string; counts?: [scenes: number, shots: number, lines: number, notes: number] }[] = [
  { file: "old_save.zip", counts: [2, 3, 4, 3] },
  { file: "current_save.zip" },
];

for (const save of LOCAL_SAVES) {
  const path = fileURLToPath(new URL(`../../local-fixtures/${save.file}`, import.meta.url));

  describe.skipIf(!existsSync(path))(`version 1 load: local ${save.file}`, () => {
    async function open(): Promise<{ project: Project; pdfNames: string[] }> {
      const zip = await JSZip.loadAsync(readFileSync(path));
      const entries = Object.values(zip.files).filter((e) => !e.dir);
      const json = entries.find((e) => e.name.toLowerCase().endsWith(".json"));
      if (!json) throw new Error("no project JSON in ZIP");
      return {
        project: parseProject(await json.async("string")),
        pdfNames: entries.filter((e) => e.name.toLowerCase().endsWith(".pdf")).map((e) => e.name),
      };
    }

    it("opens, and holds one script PDF named by the project", async () => {
      const { project, pdfNames } = await open();
      expect(project.version).toBe(1);
      expect(pdfNames).toEqual([project.scriptFileName]);
    });

    it("has well-formed scenes, shots and marks", async () => {
      const { project } = await open();
      const shotIds = new Set<string>();
      project.scenes.forEach((scene, sceneIdx) => {
        expect(scene.order).toBe(sceneIdx);
        scene.shots.forEach((shot, shotIdx) => {
          expect(shot.order).toBe(shotIdx);
          expect(shot.color).toMatch(/^#[0-9a-f]{6}$/i);
          shotIds.add(shot.id);
        });
      });
      for (const a of project.annotations) {
        expect(a.page).toBeGreaterThanOrEqual(1);
        if (a.kind !== "line") continue;
        expect(a.points).toHaveLength(2);
        for (const p of a.points) {
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.x).toBeLessThanOrEqual(1);
          expect(p.y).toBeGreaterThanOrEqual(0);
          expect(p.y).toBeLessThanOrEqual(1);
        }
        expect(a.locks).toBeDefined();
        if (a.shotId) expect(shotIds.has(a.shotId)).toBe(true);
      }
    });

    it("survives a save and reopen without changing", async () => {
      const { project } = await open();
      expect(parseProject(serializeProject(project))).toEqual(project);
    });

    it.skipIf(!save.counts)("has the expected counts", async () => {
      const { project } = await open();
      const [scenes, shots, lines, notes] = save.counts!;
      expect(project.scenes).toHaveLength(scenes);
      expect(project.scenes.flatMap((s) => s.shots)).toHaveLength(shots);
      expect(project.annotations.filter((a) => a.kind === "line")).toHaveLength(lines);
      expect(project.annotations.filter((a) => a.kind === "text")).toHaveLength(notes);
    });
  });
}
