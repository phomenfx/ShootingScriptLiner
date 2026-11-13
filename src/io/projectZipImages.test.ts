import { describe, expect, it } from "vitest";
import { createProject } from "../model/defaults";
import type { Project } from "../model/types";
import { buildProjectZip, readProjectFile } from "./projectFiles";
import { readProjectJson } from "./readProject";

describe("images in the project ZIP", () => {
  it("saves used pictures under assets/ and reads them back; unused ones are dropped", async () => {
    const project: Project = createProject();
    project.assets = [
      { id: "used", name: "still.png", type: "image/png", widthPx: 40, heightPx: 20 },
      { id: "unused", name: "old.jpg", type: "image/jpeg", widthPx: 10, heightPx: 10 },
    ];
    project.marks = [{ id: "m", kind: "image", page: 1, x: 10, y: 20, widthPt: 100, assetId: "used" }];
    const files: Record<string, Blob> = {
      used: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
      unused: new Blob([new Uint8Array([4])], { type: "image/jpeg" }),
    };
    const zip = await buildProjectZip(project, null, (id) => files[id]);
    const contents = await readProjectFile(new File([zip], "p.zip"));
    expect(Object.keys(contents.assets)).toEqual(["used"]);
    expect(new Uint8Array(await contents.assets.used!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    const { project: reopened } = readProjectJson(contents.json);
    expect(reopened.assets.map((a) => a.id)).toEqual(["used"]);
    expect(reopened.marks).toEqual(project.marks);
  });
});
