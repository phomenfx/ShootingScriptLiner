import { describe, expect, it } from "vitest";
import { createProject } from "../model/defaults";
import { cloneMark } from "../model/edits";
import type { Mark } from "../model/types";
import { readProjectJson } from "./readProject";
import { serializeProject } from "./writeProject";

describe("locked marks", () => {
  const image = { id: "img", kind: "image", page: 1, x: 10, y: 10, widthPt: 50, assetId: "a", locked: true } as Mark;

  it("stay locked through save and open", () => {
    const p = createProject();
    p.assets = [{ id: "a", name: "a.png", type: "image/png" }] as typeof p.assets;
    p.marks = [image];
    const { project } = readProjectJson(serializeProject(p));
    expect(project.marks[0]?.locked).toBe(true);
  });

  it("copies start unlocked", () => {
    expect(cloneMark(image).locked).toBeUndefined();
  });
});

describe("where the project was left", () => {
  it("is saved and read back", () => {
    const p = createProject();
    p.view = { page: 4, zoomPercent: 130, layout: "spread", scenesView: "table" };
    expect(readProjectJson(serializeProject(p)).project.view).toEqual(p.view);
  });
});
