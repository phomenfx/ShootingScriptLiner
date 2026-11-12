import { describe, expect, it } from "vitest";
import { buildShotListRows, rowsToCsv, SHOT_LIST_COLUMNS } from "../io/shotListCsv";
import { cameraRowPrints, effectiveShot, printsField, shotCaption, withCameraRowPrint, withPrintField } from "./captions";
import { createProject, createScene } from "./defaults";
import { findShot } from "./edits";
import { describeLength, formatEighths, shotLength } from "./pageLength";
import type { LineMark, Project, Shot } from "./types";

function shot(id: string, extra: Partial<Shot> = {}): Shot {
  return { id, color: "#FF0000", visible: true, status: "planned", priority: "nice", ...extra };
}

function line(id: string, page: number, y1: number, y2: number, shotId?: string): LineMark {
  return {
    id,
    kind: "line",
    page,
    shotId,
    points: [
      { x: 100, y: y1 },
      { x: 100, y: y2 },
    ],
    stroke: { pattern: "straight", widthPt: 2 },
    start: { type: "none", sizePct: 100, filled: true },
    end: { type: "arrow", sizePct: 100, filled: true },
    caption: { show: true, font: "Arial", sizePt: 11, bold: true, italic: false, underline: false, align: "left" },
  };
}

function sample(): Project {
  const project = createProject();
  const kitchen = createScene({ indicator: "INT.", location: "KITCHEN", time: "DAY" });
  kitchen.defaults = {
    movement: ["Sticks"],
    cameras: [{ name: "A", lenses: ["35mm"] }],
    audio: ["Boom"],
    fps: "24",
    sync: "sync",
    date: "2026-11-14",
  };
  kitchen.shots = [
    shot("a", { type: "WS", subject: "Kitchen" }),
    shot("b", {
      type: "CU",
      angle: "low",
      subject: "Alice",
      additionalInfo: "Moving",
      cast: ["Alice", "Ben"],
      tags: ["vfx", "custom:drone"],
      status: "pickup",
      priority: "must",
      setup: "3",
      estimatedMinutes: 20,
      own: {
        audio: [],
        cameras: [
          { name: "A", lenses: ["85mm", "135mm"] },
          { name: "B", lenses: ["50mm"] },
        ],
        sync: "mos",
      },
    }),
  ];
  project.scenes = [kitchen, createScene({ indicator: "EXT.", location: "STREET", time: "NIGHT" })];
  project.script = {
    fileName: "s.pdf",
    pageCount: 3,
    pages: [1, 2, 3].map(() => ({ widthPt: 612, heightPt: 800, rotation: 0 })),
    fingerprint: "x",
  };
  return project;
}

const found = (project: Project, id: string) => findShot(project, id)!;

describe("effective shot values", () => {
  it("uses the scene's values until the shot overrides them, even with an empty override", () => {
    const project = sample();
    const scene = project.scenes[0]!;
    expect(effectiveShot(scene, scene.shots[0]!)).toMatchObject({ location: "KITCHEN", audio: ["Boom"], sync: "sync" });
    const b = effectiveShot(scene, scene.shots[1]!);
    expect(b.audio).toEqual([]);
    expect(b.sync).toBe("mos");
    expect(b.movement).toEqual(["Sticks"]);
    expect(b.cameras).toHaveLength(2);
  });
});

describe("shot captions", () => {
  it("joins number and type, and attaches additional info to the subject", () => {
    const project = sample();
    expect(shotCaption(project, found(project, "a"))).toBe("1A-WS Kitchen");
    expect(shotCaption(project, found(project, "b"))).toBe("1B-CU Alice (Moving)");
    project.settings.general.shotIdStyle = "decimal";
    const info = project.settings.captions.fields.find((field) => field.id === "additionalInfo");
    if (info) info.divider = "spacedHyphen";
    expect(shotCaption(project, found(project, "b"))).toBe("1.2-CU Alice - Moving");
  });

  it("prints each camera row's name and lenses by its own checkbox", () => {
    const project = sample();
    const b = () => found(project, "b");
    const setShot = (next: Shot) => (project.scenes[0]!.shots[1] = next);
    // Camera and lens are off by default, so nothing prints until a row is ticked.
    expect(shotCaption(project, b())).not.toContain("135mm");
    setShot(withCameraRowPrint(project, b().shot, "lens", 0, true));
    setShot(withCameraRowPrint(project, b().shot, "camera", 1, true));
    expect(cameraRowPrints(project, b().shot, "lens", 0)).toBe(true);
    expect(cameraRowPrints(project, b().shot, "lens", 1)).toBe(false);
    const caption = shotCaption(project, b());
    expect(caption).toContain("85mm, 135mm");
    expect(caption).not.toContain("50mm");
    expect(caption).toContain("B");
    // Unticking a row back to the field's setting stores nothing.
    setShot(withCameraRowPrint(project, b().shot, "lens", 0, false));
    expect(b().shot.print).toEqual({ "camera:1": true });
  });

  it("lets a divider sit between fields or surround one", () => {
    const project = sample();
    const set = (id: string, divider: "brackets" | "slash" | "custom", dividerText?: string) => {
      project.settings.captions.fields = project.settings.captions.fields.map((field) =>
        field.id === id ? { ...field, divider, dividerText } : field
      );
    };
    set("additionalInfo", "brackets");
    expect(shotCaption(project, found(project, "b"))).toBe("1B-CU Alice [Moving]");
    set("subject", "slash");
    expect(shotCaption(project, found(project, "b"))).toBe("1B-CU / Alice [Moving]");
    set("additionalInfo", "custom", " (…) ");
    expect(shotCaption(project, found(project, "b"))).toBe("1B-CU / Alice (Moving) ");
    set("type", "custom", "-…");
    expect(shotCaption(project, found(project, "a"))).toBe("1A-WS / Kitchen");
  });

  it("prints the new fields, multi-values and scene values when they are switched on", () => {
    const project = sample();
    const on = ["angle", "cast", "tags", "movement", "lens", "camera", "audio", "sync", "date", "location"];
    project.settings.captions.fields = project.settings.captions.fields.map((f) => ({ ...f, print: f.print || on.includes(f.id) }));
    expect(shotCaption(project, found(project, "b"))).toBe(
      "1B-CU Alice (Moving) Sticks 85mm, 135mm, 50mm KITCHEN Saturday, November 14 A, B MOS Low Alice, Ben VFX, drone"
    );
    // Shot a has its scene's audio; shot b deliberately has none.
    expect(shotCaption(project, found(project, "a"))).toContain("Boom");
  });

  it("a line or note can replace the shot's own fields", () => {
    const project = sample();
    const b = found(project, "b");
    expect(shotCaption(project, b, { subject: "Bob" })).toBe("1B-CU Bob (Moving)");
    expect(shotCaption(project, b, { type: "MS" })).toBe("1B-MS Alice (Moving)");
    expect(shotCaption(project, b, { additionalInfo: "" })).toBe("1B-CU Alice");
    project.settings.captions.fields = project.settings.captions.fields.map((field) =>
      field.id === "audio" ? { ...field, print: true } : field
    );
    expect(shotCaption(project, b, { audio: ["Lav"] })).toContain("Lav");
    expect(shotCaption(project, b)).toBe("1B-CU Alice (Moving)");
  });

  it("a shot's own print checkbox wins, and matching the project setting clears it", () => {
    const project = sample();
    let b = found(project, "b").shot;
    b = withPrintField(project, b, "subject", false);
    expect(b.print).toEqual({ subject: false });
    expect(printsField(project, b, "subject")).toBe(false);
    b = withPrintField(project, b, "subject", true);
    expect(b.print).toBeUndefined();
  });
});

describe("page length", () => {
  it("counts eighths per page and counts overlaps once", () => {
    const project = sample();
    project.marks = [
      line("l1", 1, 0, 400, "a"), // half a page
      line("l2", 1, 200, 600, "a"), // overlaps l1; together 0 to 600
      line("l3", 2, 100, 200, "a"), // one eighth
      line("l4", 2, 0, 800, "b"),
    ];
    const a = shotLength(project, "a");
    expect(a).toEqual({ lineCount: 3, pages: [1, 2], eighths: 7 });
    expect(describeLength(a)).toBe("3 lines · pages 1–2 · 7/8 pgs");
    expect(describeLength(shotLength(project, "b"))).toBe("1 line · page 2 · 1 pgs");
    expect(describeLength(shotLength(project, "nobody"))).toBe("Not on script");
  });

  it("writes eighths the way a script supervisor does", () => {
    expect([1, 8, 10, 16, 19].map(formatEighths)).toEqual(["1/8", "1", "1 2/8", "2", "2 3/8"]);
  });
});

describe("shot list CSV", () => {
  it("has one row per shot, with effective values, multi-values and page length", () => {
    const project = sample();
    project.marks = [line("l1", 2, 0, 300, "b"), line("l2", 3, 0, 100, "b")];
    const rows = buildShotListRows(project);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ Scene: "1", Shot: "A", Type: "WS", Audio: "Boom", Camera: "A", Lens: "35mm", Sync: "SYNC", Lines: "0", Pages: "" });
    expect(rows[1]).toMatchObject({
      Scene: "1",
      Shot: "B",
      Status: "Pickup",
      Priority: "Must have",
      Angle: "Low",
      Cast: "Alice; Ben",
      Tags: "VFX; drone",
      Setup: "3",
      "Est. minutes": "20",
      "System/Movement": "Sticks",
      Camera: "A; B",
      Lens: "85mm + 135mm; 50mm",
      Audio: "",
      Sync: "MOS",
      "Day Scheduled": "2026-11-14",
      Pages: "2–3",
      Eighths: "4/8",
      Lines: "2",
    });
    // A scene with no shots still gets a row.
    expect(rows[2]).toMatchObject({ Scene: "2", Shot: "", Indicator: "EXT.", Location: "STREET", Time: "NIGHT" });
  });

  it("uses numbers for decimal shot IDs and quotes cells that need it", () => {
    const project = sample();
    project.settings.general.shotIdStyle = "decimal";
    project.scenes[0]!.shots[0]!.notes = 'He says "go", then leaves';
    const rows = buildShotListRows(project);
    expect(rows.map((r) => r.Shot)).toEqual(["1", "2", ""]);
    const csv = rowsToCsv(rows);
    expect(csv.startsWith(`﻿${SHOT_LIST_COLUMNS.join(",")}\r\n`)).toBe(true);
    expect(csv).toContain('"He says ""go"", then leaves"');
  });
});
