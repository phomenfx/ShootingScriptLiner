import { describe, expect, it } from "vitest";
import { createProject, createScene } from "./defaults";
import { findHeadings, parseSceneHeading, planScenes } from "./sceneDetect";

describe("reading scene headings", () => {
  it("splits a heading into indicator, location and time", () => {
    expect(parseSceneHeading("INT. KITCHEN - DAY")).toEqual({ heading: { indicator: "INT.", location: "KITCHEN", time: "DAY" } });
    expect(parseSceneHeading("2. EXT. STREET – NIGHT")).toEqual({ number: 2, label: "2", heading: { indicator: "EXT.", location: "STREET", time: "NIGHT" } });
    expect(parseSceneHeading("12A INT./EXT. CAR - MOVING - CONTINUOUS 12A")).toEqual({
      number: 12,
      label: "12A",
      heading: { indicator: "INT./EXT.", location: "CAR - MOVING", time: "CONTINUOUS" },
    });
    expect(parseSceneHeading("I/E VAN - LATER")?.heading.indicator).toBe("I/E");
    expect(parseSceneHeading("EST. CITY SKYLINE")?.heading).toEqual({ indicator: "EST.", location: "CITY SKYLINE", time: "" });
  });

  it("ignores action lines and words that only begin like a heading", () => {
    expect(parseSceneHeading("Interior shots are hard.")).toBeNull();
    expect(parseSceneHeading("INT. Alice walks in.")).toBeNull();
    expect(parseSceneHeading("EXTRA CREDIT")).toBeNull();
    expect(parseSceneHeading("INT.")).toBeNull();
  });
});

describe("placing found headings", () => {
  it("makes a blank scene 1 when the script starts at scene 2", () => {
    const found = findHeadings([["", "2. INT. KITCHEN - DAY", "Alice cooks."], ["3. EXT. GARDEN - DAY"]]);
    const plan = planScenes(createProject(), found);
    expect(plan.project.scenes.map((s) => s.heading.location)).toEqual(["", "KITCHEN", "GARDEN"]);
    expect(plan).toMatchObject({ filled: 2, blanks: 1, kept: 0 });
  });

  it("puts unnumbered headings in order and keeps scenes that already have a heading", () => {
    const project = createProject();
    project.scenes = [createScene({ indicator: "INT.", location: "OFFICE", time: "DAY" }), createScene()];
    const plan = planScenes(project, findHeadings([["INT. HALL - NIGHT", "EXT. ROOF - NIGHT", "INT. STAIRS - NIGHT"]]));
    expect(plan.project.scenes.map((s) => s.heading.location)).toEqual(["OFFICE", "ROOF", "STAIRS"]);
    expect(plan).toMatchObject({ filled: 2, kept: 1, blanks: 0 });
  });

  it("skips unnumbered matches when the script numbers its scenes", () => {
    const found = findHeadings([["TEST SCRIPT", "INT. LOCATION - DAY"], ["1. INT. LOCATION - DAY", "2. EXT. LOCATION - CONTINUOUS"]]);
    const plan = planScenes(createProject(), found);
    expect(plan.used.map((h) => h.number)).toEqual([1, 2]);
    expect(plan.project.scenes).toHaveLength(2);
  });
});

describe("using the script's scene numbers", () => {
  it("types each printed number onto its scene, with no blank scenes for gaps", () => {
    const found = findHeadings([["3. INT. HALL - DAY", "3A INT. HALL - LATER"], ["7. EXT. ROOF - NIGHT"]]);
    const plan = planScenes(createProject(), found, true);
    expect(plan.project.scenes.map((s) => s.number)).toEqual(["3", "3A", "7"]);
    expect(plan.blanks).toBe(0);
    expect(plan.filled).toBe(3);
  });
});
