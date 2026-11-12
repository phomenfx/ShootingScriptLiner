import { describe, expect, it } from "vitest";
import { createProject, createScene, createShot } from "../model/defaults";
import type { LineMark, Project } from "../model/types";
import { readProjectJson } from "./readProject";
import { serializeProject } from "./writeProject";

/** A small invented project: one scene, one shot, lines that use every stroke option. */
function sample(): Project {
  const project = createProject();
  project.script = {
    fileName: "test.pdf",
    pageCount: 1,
    pages: [{ widthPt: 612, heightPt: 792, rotation: 0 }],
    fingerprint: "test",
  };
  const scene = createScene({ indicator: "INT.", location: "TEST ROOM", time: "DAY" });
  scene.defaults.cameras = [{ name: "A", lenses: ["35mm", "50mm"] }, { name: "B", lenses: ["85mm"] }];
  const shot = {
    ...createShot(project),
    type: "WS",
    subject: "Test subject",
    print: { "camera:1": true, "lens:0": true },
    own: { location: "HALLWAY" },
  };
  scene.shots = [shot];
  project.scenes = [scene];
  const line = (id: string, extra: Partial<LineMark>): LineMark => ({
    id,
    kind: "line",
    page: 1,
    shotId: shot.id,
    points: [
      { x: 90, y: 150 },
      { x: 90, y: 300 },
      { x: 90, y: 450 },
    ],
    stroke: { pattern: "straight", widthPt: 2 },
    start: { type: "none", sizePct: 100, filled: true },
    end: { type: "arrow", sizePct: 1500, filled: true },
    caption: { show: true, font: "Arial", sizePt: 9, bold: true, italic: false, underline: false, align: "left" },
    ...extra,
  });
  project.marks = [
    line("segments", {
      segments: [null, { pattern: "wavy", widthPt: 5, lengthPct: 1800, amplitudePct: 60 }],
      own: { subject: "Only this line", cameras: [] },
    }),
    line("sided", { stroke: { pattern: "straightWavy", widthPt: 2, waveSide: "left", gapPct: 250 } }),
    line("hidden", { segments: [{ pattern: "hidden" }, null] }),
  ];
  return project;
}

describe("save and reopen", () => {
  it("keeps segment styles, pattern settings, overrides and camera row ticks", () => {
    const project = sample();
    const { project: reopened, notices } = readProjectJson(serializeProject(project), project.script);
    expect(notices).toEqual([]);
    expect(reopened.marks).toEqual(project.marks);
    expect(reopened.scenes).toEqual(project.scenes);
  });
});
