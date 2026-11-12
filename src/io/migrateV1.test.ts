import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { toLegacyProject } from "../legacy/legacyView";
import { parseProject } from "../lib/labelUtils";
import type { LineMark, Project, ScriptInfo, TextMark } from "../model/types";
import type { Project as V1Project } from "../types/project";
import { migrateV1, placeUnplacedV1Marks } from "./migrateV1";
import { ProjectReadError, readProjectJson } from "./readProject";
import { compareScript, describeScript } from "./scriptIdentity";
import { serializeProject } from "./writeProject";

const fixtureJson = readFileSync(
  fileURLToPath(new URL("../test/fixtures/v1-legacy-project.json", import.meta.url)),
  "utf8"
);

/** Three US Letter pages. */
const SCRIPT: ScriptInfo = {
  fileName: "fixture-script.pdf",
  pageCount: 3,
  pages: [1, 2, 3].map(() => ({ widthPt: 612, heightPt: 792, rotation: 0 })),
  fingerprint: "abc123",
};

const P0 = { x: 0, y: 0 };
const P1 = { x: 1, y: 1 };

function migrate(json = fixtureJson, script: ScriptInfo | undefined = SCRIPT) {
  return migrateV1(JSON.parse(json), script);
}

function line(project: Project, id: string): LineMark {
  const mark = project.marks.find((m) => m.id === id);
  if (mark?.kind !== "line") throw new Error(`no line ${id}`);
  return mark;
}

function note(project: Project, id: string): TextMark {
  const mark = project.marks.find((m) => m.id === id);
  if (mark?.kind !== "text") throw new Error(`no note ${id}`);
  return mark;
}

/**
 * What the old app showed for a save, reduced to what matters: empty and
 * missing values are the same thing, and the copies of a shot's caption that
 * a locked mark carried are not compared (version 2 does not keep them).
 */
function comparable(project: V1Project) {
  const strip = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(strip);
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, v] of Object.entries(value)) {
        if (v === undefined || v === "" || v === false || key === "captionText") continue;
        out[key] = strip(v);
      }
      return out;
    }
    return typeof value === "number" ? Math.round(value * 1e4) / 1e4 : value;
  };
  const d = project.defaultLine;
  return strip({
    name: project.name,
    labelMode: project.labelMode,
    additionalInfoStyle: project.additionalInfoStyle,
    defaultShotColor: project.defaultShotColor,
    snapAngleDegrees: project.snapAngleDegrees,
    inheritLineFromPrevious: project.inheritLineFromPrevious,
    labelOffsetXPt: project.labelOffsetXPt,
    labelOffsetYPt: project.labelOffsetYPt,
    labelSecondaryGapPt: project.labelSecondaryGapPt,
    defaultLine: [d.stroke, d.widthPt, d.fontFamily, d.fontSizePt, d.labelBold, d.start, d.end],
    lineLabelFields: project.lineLabelFields,
    scheduledDateFormat: project.scheduledDateFormat,
    scriptFileName: project.scriptFileName,
    scenes: project.scenes,
    annotations: project.annotations.map((a) => {
      if (a.kind === "line") return { ...a, label: a.shotId && a.locks.label ? undefined : a.label };
      return { ...a, text: a.followShot ? undefined : a.text };
    }),
  });
}

describe("version 1 migration: the old screens see what the old app saw", () => {
  it("invented legacy fixture", () => {
    const { project, notices } = migrate();
    expect(notices).toEqual([]);
    expect(comparable(toLegacyProject(project))).toEqual(comparable(parseProject(fixtureJson)));
  });

  for (const file of ["old_save.zip", "current_save.zip"]) {
    const path = fileURLToPath(new URL(`../../local-fixtures/${file}`, import.meta.url));
    it.skipIf(!existsSync(path))(`local ${file}`, async () => {
      const zip = await JSZip.loadAsync(readFileSync(path));
      const entries = Object.values(zip.files);
      const json = await entries.find((e) => e.name.endsWith(".json"))!.async("string");
      const pdf = entries.find((e) => e.name.endsWith(".pdf"))!;
      const script = await describeScript(await pdf.async("arraybuffer"), pdf.name);
      expect(script.pageCount).toBeGreaterThan(0);
      expect(script.fingerprint).toMatch(/^[0-9a-f]{64}$/);

      const { project, notices } = readProjectJson(json, script);
      expect(notices).toEqual([]);
      expect(project.unplacedV1Marks).toBeUndefined();
      expect(comparable(toLegacyProject(project))).toEqual(comparable(parseProject(json)));

      // It also survives a version 2 save and reopen.
      const reopened = readProjectJson(serializeProject(project));
      expect(reopened.notices).toEqual([]);
      expect(reopened.project).toMatchObject({
        scenes: project.scenes,
        marks: project.marks,
        settings: project.settings,
        script: project.script,
      });
    });
  }
});

describe("version 1 migration: each conversion", () => {
  const { project } = migrate();

  it("groups project settings", () => {
    expect(project.version).toBe(2);
    expect(project.script).toEqual(SCRIPT);
    expect(project.settings.general).toEqual({
      shotIdStyle: "letter",
      additionalInfoStyle: "parens",
      newShotColor: "#FF0000",
      newShotPriority: "nice",
    });
    expect(project.settings.captions).toMatchObject({
      offsetAcrossPt: 3,
      offsetAbovePt: 4,
      contGapPt: 4,
      dateFormat: "dddd, mmmm d",
    });
    expect(project.settings.captions.fields.slice(0, 5)).toEqual([
      { id: "shotNumber", print: true },
      { id: "type", print: true },
      { id: "subject", print: true },
      { id: "additionalInfo", print: true },
      { id: "movement", print: false },
    ]);
  });

  it("converts the old snapLineAngles switch to an angle", () => {
    expect(project.settings.drawing.angleSnapDegrees).toBe(0);
    expect(migrateV1({ version: 1, snapLineAngles: true }).project.settings.drawing.angleSnapDegrees).toBe(15);
    expect(
      migrateV1({ version: 1, snapAngleDegrees: 7, snapLineAngles: false }).project.settings.drawing
        .angleSnapDegrees
    ).toBe(7);
  });

  it("moves the old project-level labelBold and cap names into the mark defaults", () => {
    expect(project.settings.markDefaults.line).toEqual({
      stroke: { pattern: "straight", widthPt: 2 },
      start: { type: "none", sizePct: 100, filled: false },
      end: { type: "arrow", sizePct: 100, filled: true },
      caption: { font: '"Arial", sans-serif', sizePt: 11, bold: false, italic: false, underline: false, align: "left" },
    });
    expect(project.settings.markDefaults.text.style.bold).toBe(false);
  });

  it("orders scenes and shots by position and drops order numbers and sluglines", () => {
    expect(project.scenes.map((s) => s.id)).toEqual(["scene-kitchen", "scene-garage", "scene-empty"]);
    expect(project.scenes[0]!.shots.map((s) => s.id)).toEqual(["shot-kitchen-ws", "shot-kitchen-cu"]);
    expect(project.scenes[0]).not.toHaveProperty("order");
    expect(project.scenes[0]).not.toHaveProperty("slugline");
    expect(project.scenes[0]!.heading).toEqual({ indicator: "INT.", location: "KITCHEN", time: "DAY" });
    expect(project.scenes[2]).toMatchObject({ visible: false, heading: { indicator: "", location: "", time: "" } });
  });

  it("turns single scene values into lists and pairs the camera with the lens", () => {
    expect(project.scenes[0]!.defaults).toEqual({
      movement: ["Tripod"],
      cameras: [{ name: "A", lenses: ["35mm"] }],
      audio: ["Boom"],
      fps: "24",
      sync: "sync",
      date: "2026-03-14",
    });
    expect(project.scenes[1]!.defaults).toEqual({ movement: [], cameras: [], audio: [] });
  });

  it("leaves blank shot values inherited and turns non-blank ones into overrides", () => {
    const [ws, cu] = project.scenes[0]!.shots;
    expect(ws).toEqual({
      id: "shot-kitchen-ws",
      color: "#FF0000",
      visible: true,
      status: "planned",
      priority: "nice",
      type: "WS",
      subject: "Kitchen",
    });
    expect(cu).toMatchObject({ type: "CU", subject: "Robin", additionalInfo: "Pouring tea", notes: "Rack focus to the cup" });
    // The shot only set a lens; the camera name comes from the scene's camera.
    expect(cu!.own).toEqual({ cameras: [{ name: "A", lenses: ["85mm"] }] });
    expect(project.scenes[1]!.shots[0]!.own).toEqual({ cameras: [{ name: "", lenses: ["24mm"] }], sync: "mos" });
  });

  it("maps sync words to keys, keeps unknown ones as typed, and renames print checkboxes", () => {
    const { project: p } = migrateV1({
      version: 1,
      scenes: [
        {
          id: "s",
          sync: "ADR/Foley",
          shots: [
            { id: "a", sync: "sync", lineLabelInclude: { shotType: false, cameraSupport: true, bogus: true } },
            { id: "b", sync: "Wild track" },
          ],
        },
      ],
    });
    expect(p.scenes[0]!.defaults.sync).toBe("adr");
    expect(p.scenes[0]!.shots.map((s) => s.own?.sync)).toEqual(["sync", "Wild track"]);
    expect(p.scenes[0]!.shots[0]!.print).toEqual({ type: false, movement: true });
  });

  it("turns page fractions into PDF points, using each page's own size", () => {
    expect(line(project, "line-linked").points).toEqual([
      { x: 61.2, y: 158.4 },
      { x: 61.2, y: 475.2 },
    ]);
    expect(note(project, "note-plain")).toMatchObject({ x: 244.8, y: 237.6 });

    const wide = { widthPt: 1000, heightPt: 500, rotation: 90 };
    const { project: p } = migrate(fixtureJson, { ...SCRIPT, pages: [SCRIPT.pages[0]!, wide, SCRIPT.pages[2]!] });
    expect(line(p, "line-unlinked-legacy-style").points).toEqual([
      { x: 500, y: 25 },
      { x: 600, y: 150 },
    ]);
  });

  it("a locked caption and color drop their copies", () => {
    const l = line(project, "line-linked");
    expect(l.shotId).toBe("shot-kitchen-ws");
    expect(l.caption.text).toBeUndefined();
    expect(l.color).toBeUndefined();
    expect(l).not.toHaveProperty("locks");
    expect(l).not.toHaveProperty("label");
  });

  it("an unlocked caption becomes caption.text and an unlocked color is kept", () => {
    const l = line(project, "line-custom-caption");
    expect(l).toMatchObject({
      shotId: "shot-kitchen-cu",
      color: "#8800CC",
      stroke: { pattern: "dashed_4_3_2_3", widthPt: 3 },
      start: { type: "circle", sizePct: 150, filled: false },
      end: { type: "slash", sizePct: 100, filled: true },
      caption: { text: "Robin's hands only", font: '"Consolas", monospace', sizePt: 9, bold: false, show: true },
    });
  });

  it("an unlocked but empty caption follows the shot", () => {
    const { project: p } = migrateV1(
      {
        version: 1,
        scenes: [{ id: "s", shots: [{ id: "a" }] }],
        annotations: [{ id: "l", kind: "line", page: 1, points: [P0, P1], shotId: "a", label: "", locks: { label: false, color: true } }],
      },
      SCRIPT
    );
    expect(line(p, "l").caption.text).toBeUndefined();
  });

  it("upgrades an old-style unlinked line", () => {
    const l = line(project, "line-unlinked-legacy-style");
    expect(l.shotId).toBeUndefined();
    expect(l.color).toBe("#111111");
    expect(l.stroke).toEqual({ pattern: "dotted", widthPt: 3 });
    expect(l.end.type).toBe("diamond");
    expect(l.caption).toEqual({
      show: false,
      font: '"Arial", sans-serif',
      sizePt: 11,
      bold: false,
      italic: false,
      underline: false,
      align: "left",
    });
  });

  it("drops continuedFromLineId segments and keeps the bottom continuation", () => {
    expect(project.marks.map((m) => m.id)).toEqual([
      "line-linked",
      "line-custom-caption",
      "line-unlinked-legacy-style",
      "line-continues",
      "note-plain",
      "note-follows-shot",
    ]);
    expect(line(project, "line-continues").marginContinuation).toBe("bottom");
  });

  it("converts caption boxes, flipping the upward offset to page coordinates", () => {
    const { project: p } = migrateV1(
      {
        version: 1,
        labelOffsetXPt: 5,
        annotations: [
          {
            id: "l",
            kind: "line",
            page: 1,
            points: [P0, P1],
            labelOffsetYPt: 20,
            labelWidthPt: 120,
            labelMinHeightPt: 30,
            labelAlign: "center",
            labelItalic: true,
            secondaryOffsetXPt: 7,
            secondaryGapPt: 9,
            secondaryWidthPt: 80,
            secondaryAlign: "right",
          },
        ],
      },
      SCRIPT
    );
    const l = line(p, "l");
    // Only Y was set; X is completed from the project setting.
    expect(l.caption.offset).toEqual({ x: 5, y: -20 });
    expect(l.caption).toMatchObject({ widthPt: 120, minHeightPt: 30, align: "center", italic: true });
    expect(l.contCaption).toEqual({ offsetXPt: 7, gapPt: 9, widthPt: 80, align: "right" });
  });

  it("an unlinked note keeps its text and color", () => {
    expect(note(project, "note-plain")).toEqual({
      id: "note-plain",
      kind: "text",
      page: 1,
      x: 244.8,
      y: 237.6,
      show: true,
      text: "Check props",
      color: "#111111",
      style: { font: '"Courier New", monospace', sizePt: 14, bold: true, italic: false, underline: false, align: "left" },
    });
  });

  it("a note that follows its shot drops its copies; followShot: false keeps the text", () => {
    const n = note(project, "note-follows-shot");
    expect(n.shotId).toBe("shot-kitchen-cu");
    expect(n.text).toBeUndefined();
    expect(n.color).toBeUndefined();
    expect(n).not.toHaveProperty("followShot");

    const { project: p } = migrateV1(
      {
        version: 1,
        scenes: [{ id: "s", shots: [{ id: "a" }] }],
        annotations: [
          { id: "n", kind: "text", page: 1, x: 0.5, y: 0.5, text: "Mine", color: "#123456", shotId: "a", followShot: false, locks: { shotId: true, color: false } },
        ],
      },
      SCRIPT
    );
    expect(note(p, "n")).toMatchObject({ shotId: "a", text: "Mine", color: "#123456" });
  });

  it("a mark linked to a shot that is gone becomes unlinked and keeps its color", () => {
    const { project: p } = migrateV1(
      {
        version: 1,
        annotations: [
          { id: "l", kind: "line", page: 1, points: [P0, P1], style: { color: "#ABCDEF" }, shotId: "gone", locks: { label: true, color: true } },
        ],
      },
      SCRIPT
    );
    expect(line(p, "l").shotId).toBeUndefined();
    expect(line(p, "l").color).toBe("#ABCDEF");
  });

  it("reports marks it cannot read instead of failing", () => {
    const { project: p, notices } = migrateV1(
      {
        version: 1,
        annotations: [
          { id: "ok", kind: "text", page: 1, x: 0.1, y: 0.1, text: "Hi" },
          { id: "bad", kind: "line", page: 2 },
          { id: "odd", kind: "sticker", page: 1 },
        ],
      },
      SCRIPT
    );
    expect(p.marks.map((m) => m.id)).toEqual(["ok"]);
    expect(notices).toEqual([
      "Skipped line 2 on page 2: its points are missing.",
      'Skipped mark 3: unknown kind "sticker".',
    ]);
  });
});

describe("version 1 migration: a save opened without its script PDF", () => {
  const { project, notices } = migrateV1(JSON.parse(fixtureJson));

  it("keeps the marks aside, says so, and keeps them through a save", () => {
    expect(project.marks).toEqual([]);
    expect(project.unplacedV1Marks).toHaveLength(7);
    expect(project.script).toEqual({ fileName: "fixture-script.pdf", pageCount: 0, pages: [], fingerprint: "" });
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain("Import the script");
    expect(readProjectJson(serializeProject(project)).project.unplacedV1Marks).toEqual(project.unplacedV1Marks);
  });

  it("places them once the script is known, exactly as if it had been there", () => {
    const placed = placeUnplacedV1Marks({ ...project, script: SCRIPT });
    expect(placed.notices).toEqual([]);
    expect(placed.project.unplacedV1Marks).toBeUndefined();
    expect(placed.project).toEqual(migrate().project);
  });
});

describe("version 2 reader and writer", () => {
  const { project } = migrate();
  const saved = () => JSON.parse(serializeProject(project, new Date("2026-11-12T10:00:00Z")));
  const read = (raw: unknown) => readProjectJson(JSON.stringify(raw));

  it("writes version 2 with file details, and reads back the same project", () => {
    const raw = saved();
    expect(raw).toMatchObject({ version: 2, savedAt: "2026-11-12T10:00:00.000Z", appVersion: "test" });
    const { project: back, notices } = read(raw);
    expect(notices).toEqual([]);
    expect(back).toEqual({ ...project, savedAt: raw.savedAt, appVersion: "test" });
  });

  it("opens version 1 through the migration, and refuses other versions", () => {
    expect(readProjectJson(fixtureJson, SCRIPT).project).toEqual(project);
    expect(() => read({ version: 3 })).toThrow(/newer version/);
    expect(() => read({ version: 0 })).toThrow("Unsupported project version");
    expect(() => readProjectJson("not json")).toThrow(ProjectReadError);
  });

  it("skips broken records with a notice that names them, and keeps the rest", () => {
    const raw = saved();
    raw.scenes.push({ heading: {} }, "junk");
    raw.scenes[0].shots.push({ color: "#000000" });
    raw.marks.push(
      { id: "x1", kind: "line", page: 2, points: [{ x: 1, y: 1 }] },
      { id: "x2", kind: "hologram", page: 1 },
      { id: "x3", kind: "image", page: 1, x: 0, y: 0, widthPt: 10, assetId: "missing" },
      { ...raw.marks[0] }
    );
    const { project: back, notices } = read(raw);
    expect(back.scenes).toEqual(project.scenes);
    expect(back.marks).toEqual(project.marks);
    expect(notices).toEqual([
      "Skipped shot 3 of scene 1: it has no id.",
      "Skipped scene 4: it has no id.",
      "Skipped scene 5: it is not a record.",
      "Skipped line 7 on page 2: its points are missing or broken.",
      'Skipped mark 8 on page 1: its kind "hologram" is not known to this version of the app.',
      "Skipped image 9 on page 1: its image file is not in the project.",
      "Skipped line 10 on page 1: its id is used twice.",
    ]);
  });

  it("unlinks a mark whose shot is gone and gives it a color", () => {
    const raw = saved();
    raw.scenes[0].shots = [];
    const { project: back, notices } = read(raw);
    expect(line(back, "line-linked")).toMatchObject({ color: "#FF0000" });
    expect(line(back, "line-linked").shotId).toBeUndefined();
    expect(note(back, "note-follows-shot")).toMatchObject({ text: "", color: "#111111" });
    expect(notices).toHaveLength(3);
    expect(notices[0]).toBe("Line 1 on page 1 was linked to a shot that no longer exists, so it was unlinked.");
  });

  it("ignores unknown fields but never drops unknown choice keys", () => {
    const raw = saved();
    raw.futureThing = { a: 1 };
    raw.marks[0].futureField = true;
    raw.marks[0].stroke.pattern = "custom:sparkle";
    raw.marks[0].end.type = "trident";
    raw.scenes[0].shots[0].status = "custom:reshoot";
    raw.scenes[0].shots[0].tags = ["vfx", "custom:drone"];
    raw.settings.lists.status = [{ key: "custom:reshoot", label: "Reshoot", color: "#ff0000" }];
    const { project: back, notices } = read(raw);
    expect(notices).toEqual([]);
    expect(back).not.toHaveProperty("futureThing");
    expect(back.marks[0]).not.toHaveProperty("futureField");
    expect(line(back, "line-linked").stroke.pattern).toBe("custom:sparkle");
    expect(line(back, "line-linked").end.type).toBe("trident");
    expect(back.scenes[0]!.shots[0]).toMatchObject({ status: "custom:reshoot", tags: ["vfx", "custom:drone"] });
    expect(back.settings.lists.status).toEqual([{ key: "custom:reshoot", label: "Reshoot", color: "#ff0000" }]);
    // Saving again keeps them.
    expect(read(JSON.parse(serializeProject(back))).project.marks[0]).toEqual(back.marks[0]);
  });

  it("an override that is present but empty stays an override", () => {
    const raw = saved();
    raw.scenes[0].shots[0].own = { audio: [], location: "" };
    expect(read(raw).project.scenes[0]!.shots[0]!.own).toEqual({ audio: [], location: "" });
  });

  it("fills in settings that are missing", () => {
    const { project: back } = read({ version: 2, name: "Bare" });
    expect(back.settings.general.newShotColor).toBe("#FF0000");
    expect(back.settings.captions.fields).toHaveLength(19);
    expect(back.settings.lists.tags).toHaveLength(7);
    expect(back).toMatchObject({ scenes: [], marks: [], assets: [] });
  });
});

describe("script identity", () => {
  const other = { ...SCRIPT, fingerprint: "zzz" };
  it("compares a saved script with the PDF at hand", () => {
    expect(compareScript(undefined, SCRIPT)).toBe("unknown");
    expect(compareScript({ ...SCRIPT, fingerprint: "" }, SCRIPT)).toBe("unknown");
    expect(compareScript(SCRIPT, { ...SCRIPT })).toBe("same");
    expect(compareScript(SCRIPT, other)).toBe("changed");
    expect(compareScript(SCRIPT, { ...other, pageCount: 9 })).toBe("pageCountChanged");
  });
});
