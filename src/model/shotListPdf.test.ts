import { describe, expect, it } from "vitest";
import { createProject, createScene, createShot } from "./defaults";
import { clipText, DEFAULT_SHOT_LIST_PDF, layoutShotList, printGroups, wrapText, type DrawOp } from "./shotListPdf";
import { TABLE_COLUMNS } from "./shotTable";
import type { Project } from "./types";

/** Every character is half the text size wide. */
const measure = (text: string, size: number) => text.length * size * 0.5;
const cols = (ids: string[]) => TABLE_COLUMNS.filter((c) => ids.includes(c.id));
const texts = (ops: DrawOp[]) => ops.filter((o): o is Extract<DrawOp, { op: "text" }> => o.op === "text").map((o) => o.text);

function project(shotsPerScene: number[]): Project {
  const p = createProject();
  p.name = "Test";
  p.scenes = shotsPerScene.map((n, i) => {
    const scene = createScene();
    scene.heading = { indicator: "INT.", location: `ROOM ${i + 1}`, time: "DAY" };
    scene.shots = Array.from({ length: n }, () => ({ ...createShot(p), subject: "Subject" }));
    return scene;
  });
  return p;
}

describe("text fitting", () => {
  const m = (t: string) => t.length;
  it("wraps by words and breaks long words", () => {
    expect(wrapText("aa bb cc", 5, m)).toEqual(["aa bb", "cc"]);
    expect(wrapText("abcdefgh", 3, m)).toEqual(["abc", "def", "gh"]);
  });
  it("cuts short with an ellipsis", () => {
    expect(clipText("abcdefgh", 4, m)).toBe("abc…");
    expect(clipText("abc", 4, m)).toBe("abc");
  });
});

describe("what prints", () => {
  it("leaves out hidden shots and skipped statuses unless asked", () => {
    const p = project([3]);
    p.scenes[0]!.shots[0]!.visible = false;
    p.scenes[0]!.shots[1]!.status = "cut";
    expect(printGroups(p, { ...DEFAULT_SHOT_LIST_PDF, skipStatus: ["cut"] })[0]!.shots).toHaveLength(1);
    expect(printGroups(p, { ...DEFAULT_SHOT_LIST_PDF, includeHidden: true })[0]!.shots).toHaveLength(3);
  });
  it("ignores a saved scene choice from another project", () => {
    expect(printGroups(project([1, 1]), { ...DEFAULT_SHOT_LIST_PDF, sceneIds: ["gone"] })).toHaveLength(2);
  });
});

describe("layout", () => {
  it("fits the columns to the page width and repeats the header on each page", () => {
    const p = project([200]);
    const layout = layoutShotList(p, DEFAULT_SHOT_LIST_PDF, TABLE_COLUMNS, {}, measure);
    expect(layout.pageWidthPt).toBe(792);
    expect(layout.pages.length).toBeGreaterThan(1);
    for (const page of layout.pages) {
      expect(texts(page)).toContain("Shot");
      expect(texts(page).some((t) => t.startsWith("Page "))).toBe(true);
    }
    // Grid spans the printable width (page minus half-inch margins).
    const widest = Math.max(...layout.pages[0]!.filter((o) => o.op === "fill").map((o) => (o.op === "fill" ? o.w : 0)));
    expect(widest).toBeCloseTo(792 - 72, 0);
  });

  it("leaves out columns past the page edge at a set scale", () => {
    const layout = layoutShotList(project([1]), { ...DEFAULT_SHOT_LIST_PDF, fit: false, scalePct: 300, landscape: false }, cols(["shot", "status", "priority", "subject", "notes"]), {}, measure);
    expect(layout.dropped.length).toBeGreaterThan(0);
  });

  it("starts each scene on a new page when asked", () => {
    const layout = layoutShotList(project([2, 2, 2]), { ...DEFAULT_SHOT_LIST_PDF, newPagePerGroup: true }, TABLE_COLUMNS, {}, measure);
    expect(layout.pages).toHaveLength(3);
    expect(texts(layout.pages[1]!).some((t) => t.includes("ROOM 2"))).toBe(true);
  });

  it("uses dragged column widths", () => {
    const a = layoutShotList(project([1]), { ...DEFAULT_SHOT_LIST_PDF, fit: false, checkbox: false }, cols(["shot", "subject"]), {}, measure);
    const b = layoutShotList(project([1]), { ...DEFAULT_SHOT_LIST_PDF, fit: false, checkbox: false }, cols(["shot", "subject"]), { subject: 20 }, measure);
    const width = (l: typeof a) => Math.max(...l.pages[0]!.map((o) => (o.op === "fill" ? o.w : 0)));
    expect(width(b)).toBeGreaterThan(width(a));
  });
});
