import { describe, expect, it } from "vitest";
import { formatExcelDate } from "./dateFormat";
import { getLineDisplayLabel, getTextDisplayText } from "./annotationUtils";
import { formatLineCaption } from "./lineCaption";
import { formatShotLabel, parseProject, serializeProject } from "./labelUtils";
import { buildShotListRows, rowsToCsv, SHOT_LIST_COLUMNS } from "./shotListExport";
import { newId } from "./ids";
import { DEFAULT_PROJECT, type Project, type Scene, type Shot } from "../types/project";
import { DEFAULT_LINE_LOCKS } from "../types/annotations";

function shot(extra: Partial<Shot> = {}): Shot {
  return {
    id: newId(),
    order: 0,
    color: "#FF0000",
    visible: true,
    shotType: "WS",
    subject: "Subject",
    slug: "Moving Master",
    ...extra,
  };
}

function scene(shots: Shot[], extra: Partial<Scene> = {}): Scene {
  return {
    id: newId(),
    slugline: extra.slugline ?? "Entry Room",
    order: 0,
    visible: true,
    shots,
    ...extra,
  };
}

function withScenes(scenes: Scene[], extra: Partial<Project> = {}): Project {
  return { ...DEFAULT_PROJECT, ...extra, scenes };
}

describe("formatExcelDate", () => {
  it("renders Excel date codes", () => {
    expect(formatExcelDate("2012-03-14", "dddd, mmmm d")).toBe("Wednesday, March 14");
    expect(formatExcelDate("2012-03-14", "yyyy/m/d")).toBe("2012/3/14");
    expect(formatExcelDate("2012-03-14", "mm/dd/yyyy")).toBe("03/14/2012");
    expect(formatExcelDate("2012-03-14", 'mmm d, yyyy "at" mmmmm')).toBe("Mar 14, 2012 at M");
  });
});

describe("formatLineCaption", () => {
  it("matches today's shot label with the default fields", () => {
    const sh = shot();
    const sc = scene([sh]);
    const project = withScenes([sc]);
    expect(formatLineCaption(sc, sh, project)).toBe(
      formatShotLabel(sc, sh, project.scenes, "letter", "parens")
    );
    expect(formatLineCaption(sc, sh, project)).toBe("1A-WS Subject (Moving Master)");
  });

  it("appends lens when that shot turns it on", () => {
    const sh = shot({ lens: "35mm", lineLabelInclude: { lens: true } });
    const sc = scene([sh]);
    const project = withScenes([sc]);
    expect(formatLineCaption(sc, sh, project)).toBe("1A-WS Subject (Moving Master) 35mm");
  });

  it("follows a reordered project list", () => {
    const sh = shot({ lens: "35mm" });
    const sc = scene([sh]);
    const fields = DEFAULT_PROJECT.lineLabelFields.map((field) =>
      field.id === "lens" ? { ...field, enabled: true } : { ...field }
    );
    const lens = fields.findIndex((field) => field.id === "lens");
    const subject = fields.findIndex((field) => field.id === "subject");
    const next = [...fields];
    const [moved] = next.splice(lens, 1);
    next.splice(subject, 0, moved!);
    const project = withScenes([sc], { lineLabelFields: next });
    expect(formatLineCaption(sc, sh, project)).toBe("1A-WS 35mm Subject (Moving Master)");
  });

  it("uses the date format on the caption only", () => {
    const sh = shot({ lineLabelInclude: { scheduledDate: true } });
    const sc = scene([sh], { scheduledDate: "2012-03-14" });
    const project = withScenes([sc], { scheduledDateFormat: "yyyy/m/d" });
    expect(formatLineCaption(sc, sh, project)).toContain("2012/3/14");
  });
});

describe("line and text overrides", () => {
  it("keeps a custom unlocked line label", () => {
    const sh = shot();
    const sc = scene([sh]);
    const project = withScenes([sc], {
      annotations: [
        {
          id: "line-1",
          kind: "line",
          page: 1,
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
          style: {
            stroke: "solid",
            widthPt: 1,
            color: "#111111",
            start: { cap: "none", scalePercent: 100, filled: true },
            end: { cap: "none", scalePercent: 100, filled: true },
          },
          fontFamily: "Arial",
          fontSizePt: 11,
          labelBold: true,
          shotId: sh.id,
          label: "Custom line",
          showLabel: true,
          locks: { ...DEFAULT_LINE_LOCKS, label: false },
        },
      ],
    });
    const line = project.annotations[0];
    if (!line || line.kind !== "line") throw new Error("expected line");
    expect(getLineDisplayLabel(line, project)).toBe("Custom line");
  });

  it("shows custom text, then the shot caption, then an unlocked override", () => {
    const sh = shot();
    const sc = scene([sh]);
    const base = {
      id: "text-1",
      kind: "text" as const,
      page: 1,
      x: 0.2,
      y: 0.2,
      text: "Note",
      color: "#111111",
    };
    const project = withScenes([sc]);
    expect(getTextDisplayText(base, project)).toBe("Note");
    expect(getTextDisplayText({ ...base, shotId: sh.id, followShot: true }, project)).toBe(
      "1A-WS Subject (Moving Master)"
    );
    expect(
      getTextDisplayText(
        { ...base, shotId: sh.id, followShot: false, text: "One off" },
        project
      )
    ).toBe("One off");
  });
});

describe("parseProject compatibility", () => {
  it("inherits scene gear and keeps a shot override", () => {
    const sh = shot({ camera: "B", lineLabelInclude: { camera: true, cameraSupport: true } });
    const sc = scene([sh], {
      camera: "ARRI Alexa 35",
      cameraSupport: "Sticks",
      fps: "24",
      sync: "SYNC",
      indicator: "INT.",
      location: "BEDROOM",
      timeOfDay: "DAY",
    });
    const project = withScenes([sc]);
    expect(formatLineCaption(sc, sh, project)).toContain("B");
    expect(formatLineCaption(sc, sh, project)).toContain("Sticks");
    const rows = buildShotListRows(project);
    expect(rows[0]?.Camera).toBe("B");
    expect(rows[0]?.["System/Movement"]).toBe("Sticks");
    expect(rows[0]?.FPS).toBe("24");
    expect(rows[0]?.Sync).toBe("SYNC");
    expect(rows[0]?.Indicator).toBe("INT.");
    expect(rows[0]?.Time).toBe("DAY");
    expect(rows[0]?.Slugline).toBe("Entry Room");
  });

  it("splits an old slugline into indicator, location, and time", () => {
    const loaded = parseProject(
      JSON.stringify({
        version: 1,
        name: "Old",
        labelMode: "letter",
        defaultShotColor: "#FF0000",
        scenes: [
          {
            id: "sc",
            order: 0,
            visible: true,
            slugline: "INT./EXT. CAR - DAY",
            shots: [],
          },
        ],
        annotations: [],
      })
    );
    const sceneLoaded = loaded.scenes[0];
    expect(sceneLoaded?.indicator).toBe("INT./EXT.");
    expect(sceneLoaded?.location).toBe("CAR");
    expect(sceneLoaded?.timeOfDay).toBe("DAY");
    expect(sceneLoaded?.slugline).toBe("INT./EXT. CAR - DAY");
    expect(loaded.lineLabelFields.find((field) => field.id === "camera")?.enabled).toBe(false);
  });

  it("keeps a saved location when the old slugline is still present", () => {
    const loaded = parseProject(
      JSON.stringify({
        version: 1,
        name: "Old",
        labelMode: "letter",
        defaultShotColor: "#FF0000",
        scenes: [
          {
            id: "sc",
            order: 0,
            visible: true,
            slugline: "INT. KITCHEN - DAY",
            location: "Stage",
            shots: [],
          },
        ],
        annotations: [],
      })
    );
    expect(loaded.scenes[0]?.location).toBe("Stage");
    expect(loaded.scenes[0]?.indicator ?? "").toBe("");
    expect(loaded.scenes[0]?.slugline).toBe("INT. KITCHEN - DAY");
  });

  it("loads a version-1 file with no new fields and keeps the current caption", () => {
    const sh = shot();
    const sc = scene([sh]);
    const legacy = {
      version: 1,
      name: "Old",
      labelMode: "letter",
      defaultShotColor: "#FF0000",
      scenes: [sc],
      annotations: [],
    };
    const loaded = parseProject(JSON.stringify(legacy));
    const sceneLoaded = loaded.scenes[0];
    const shotLoaded = sceneLoaded?.shots[0];
    if (!sceneLoaded || !shotLoaded) throw new Error("expected shot");
    expect(formatLineCaption(sceneLoaded, shotLoaded, loaded)).toBe(
      "1A-WS Subject (Moving Master)"
    );
    expect(shotLoaded.scheduledDate ?? "").toBe("");
    expect(loaded.scheduledDateFormat).toBe(DEFAULT_PROJECT.scheduledDateFormat);
    const again = parseProject(serializeProject(loaded));
    expect(again.lineLabelFields.map((field) => field.id)).toEqual(
      loaded.lineLabelFields.map((field) => field.id)
    );
  });
});

describe("shot list export", () => {
  it("keeps subject and additional info in separate cells", () => {
    const sh = shot({ subject: "Gabriel", slug: "Moving", lens: "" });
    const sc = scene([sh], { location: "Stage", scheduledDate: "2012-03-14" });
    const rows = buildShotListRows(withScenes([sc]));
    expect(rows[0]?.Subject).toBe("Gabriel");
    expect(rows[0]?.["Additional info"]).toBe("Moving");
    expect(rows[0]?.Shot).toBe("A");
    expect(rows[0]?.Location).toBe("Stage");
    expect(rows[0]?.["Day Scheduled"]).toBe("2012-03-14");
    const csv = rowsToCsv(rows);
    expect(csv).toContain("2012-03-14");
    expect(csv).not.toContain("Wednesday");
  });

  it("uses the decimal index when label mode is decimal", () => {
    const sh = shot();
    const sc = scene([sh]);
    const rows = buildShotListRows(withScenes([sc], { labelMode: "decimal" }));
    expect(rows[0]?.Shot).toBe("1");
  });

  it("exports a scene that has no shots", () => {
    const sc = scene([], { location: "Alley", scheduledDate: "2012-03-27" });
    const rows = buildShotListRows(withScenes([sc]));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.Slugline).toBe("Entry Room");
    expect(rows[0]?.Location).toBe("Alley");
    expect(rows[0]?.Shot).toBe("");
  });

  it("quotes commas and quotes and writes one header", () => {
    const sh = shot({ subject: 'Say "hi"', slug: "A, B" });
    const csv = rowsToCsv(buildShotListRows(withScenes([scene([sh])])));
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const lines = csv.replace(/^\uFEFF/, "").split("\r\n");
    expect(lines[0]).toBe(SHOT_LIST_COLUMNS.join(","));
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('"Say ""hi"""');
    expect(lines[1]).toContain('"A, B"');
    expect(lines.some((line) => line.startsWith("Scene 1"))).toBe(false);
  });
});
