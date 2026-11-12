/**
 * Safety net for the store split (build step 2).
 * Pins add, link, reorder and delete as they work today.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { formatShotLabel } from "../lib/labelUtils";
import { useProjectStore } from "../stores/projectStore";
import { DEFAULT_LINE_ENDING, DEFAULT_LINE_LOCKS } from "../types/annotations";
import type { LineAnnotation, TextAnnotation } from "../types/annotations";

const store = () => useProjectStore.getState();
const project = () => store().project;
const scenes = () => project().scenes;

function makeLine(id: string, shotId?: string, color = "#000000"): LineAnnotation {
  return {
    id,
    kind: "line",
    page: 1,
    points: [
      { x: 0.1, y: 0.2 },
      { x: 0.1, y: 0.6 },
    ],
    style: {
      stroke: "solid",
      widthPt: 2,
      color,
      start: { ...DEFAULT_LINE_ENDING },
      end: { ...DEFAULT_LINE_ENDING },
    },
    fontFamily: '"Arial", sans-serif',
    fontSizePt: 11,
    labelBold: true,
    showLabel: true,
    shotId,
    locks: shotId
      ? { ...DEFAULT_LINE_LOCKS }
      : { shotId: false, shotType: false, label: false, color: false },
  };
}

function shotLabels(): string[] {
  return scenes().flatMap((scene) =>
    scene.shots.map((shot) => formatShotLabel(scene, shot, scenes(), project().labelMode))
  );
}

/** Two scenes: scene 1 with shots a, b, c; scene 2 with shot d. Returns the IDs. */
function seed() {
  store().addScene("INT. KITCHEN - DAY");
  const s1 = scenes()[0]!.id;
  store().addShot(s1);
  store().addShot(s1);
  store().addShot(s1);
  store().addScene("EXT. GARAGE - NIGHT");
  const s2 = scenes()[1]!.id;
  store().addShot(s2);
  const [a, b, c] = scenes()[0]!.shots.map((sh) => sh.id) as [string, string, string];
  const d = scenes()[1]!.shots[0]!.id;
  store().updateShot(s1, a, { subject: "a" });
  store().updateShot(s1, b, { subject: "b" });
  store().updateShot(s1, c, { subject: "c" });
  store().updateShot(s2, d, { subject: "d" });
  return { s1, s2, a, b, c, d };
}

beforeEach(() => {
  store().newProject();
});

describe("projectStore: add", () => {
  it("adds a scene, splits its slugline and selects it", () => {
    store().addScene("INT. KITCHEN - DAY");
    const scene = scenes()[0]!;
    expect(scene).toMatchObject({
      order: 0,
      visible: true,
      shots: [],
      indicator: "INT.",
      location: "KITCHEN",
      timeOfDay: "DAY",
    });
    expect(store().selection).toEqual({ kind: "scene", sceneId: scene.id });
  });

  it("adds a shot with the project color to the given scene and selects it", () => {
    store().setDefaultShotColor("#00AA55");
    store().addScene();
    const sceneId = scenes()[0]!.id;
    store().addShot(sceneId);
    const shot = scenes()[0]!.shots[0]!;
    expect(shot).toEqual({ id: shot.id, order: 0, color: "#00AA55", visible: true });
    expect(store().selection).toEqual({ kind: "shot", sceneId, shotId: shot.id });
  });

  it("adds a shot to the selected shot's scene, or the last scene when nothing is selected", () => {
    const { s1, s2, a } = seed();
    store().selectShot(s1, a);
    store().addShot();
    expect(scenes()[0]!.shots).toHaveLength(4);
    store().clearSelection();
    store().addShot();
    expect(scenes().find((s) => s.id === s2)!.shots).toHaveLength(2);
  });

  it("does nothing when there is no scene to add a shot to", () => {
    store().addShot();
    expect(scenes()).toEqual([]);
  });

  it("expands a collapsed scene when a shot is added to it", () => {
    const { s1 } = seed();
    store().setSceneCollapsed(s1, true);
    expect(store().collapsedSceneIds[s1]).toBe(true);
    store().addShot(s1);
    expect(store().collapsedSceneIds[s1]).toBeUndefined();
  });

  it("adds lines and notes and selects them", () => {
    store().addLine(makeLine("line-1"));
    expect(store().selection).toEqual({ kind: "annotation", annotationId: "line-1" });
    const note: TextAnnotation = { id: "note-1", kind: "text", page: 1, x: 0.5, y: 0.5, text: "Hi", color: "#111111" };
    store().addText(note);
    expect(project().annotations.map((a) => a.id)).toEqual(["line-1", "note-1"]);
    expect(store().selection).toEqual({ kind: "annotation", annotationId: "note-1" });
  });
});

describe("projectStore: link", () => {
  it("a color-locked linked line follows its shot's color", () => {
    const { s1, a } = seed();
    store().addLine(makeLine("line-1", a));
    store().updateShot(s1, a, { color: "#3366FF" });
    const line = store().getSelectedLine()!;
    expect(line.style.color).toBe("#3366FF");
  });

  it("a line with the color lock off keeps its own color", () => {
    const { s1, a } = seed();
    store().addLine(makeLine("line-1", a, "#8800CC"));
    store().updateLineLocks("line-1", { color: false });
    store().updateShot(s1, a, { color: "#3366FF" });
    const line = store().getSelectedLine()!;
    expect(line.locks).toEqual({ shotId: true, shotType: true, label: true, color: false });
    expect(line.style.color).toBe("#8800CC");
  });

  it("a color-locked linked note follows its shot's color", () => {
    const { s1, a } = seed();
    store().addText({
      id: "note-1",
      kind: "text",
      page: 1,
      x: 0.5,
      y: 0.5,
      text: "Hi",
      color: "#111111",
      shotId: a,
      followShot: true,
      locks: { shotId: true, color: true },
    });
    store().updateShot(s1, a, { color: "#3366FF" });
    expect(project().annotations[0]).toMatchObject({ color: "#3366FF" });
  });

  it("linking and unlinking a line is a plain patch", () => {
    const { a } = seed();
    store().addLine(makeLine("line-1"));
    store().updateLine("line-1", { shotId: a });
    expect(store().getSelectedLine()!.shotId).toBe(a);
    store().updateLine("line-1", { shotId: undefined });
    expect(store().getSelectedLine()!.shotId).toBeUndefined();
  });

  it("with a line selected, new shots go to that line's scene", () => {
    const { a } = seed();
    store().addLine(makeLine("line-1", a));
    store().addShot();
    expect(scenes()[0]!.shots).toHaveLength(4);
  });
});

describe("projectStore: reorder", () => {
  it("shot IDs ripple when a shot moves within its scene", () => {
    const { s1, a, c } = seed();
    expect(shotLabels()).toEqual(["1A a", "1B b", "1C c", "2A d"]);
    store().moveShotWithinScene(s1, c, a);
    expect(shotLabels()).toEqual(["1A c", "1B a", "1C b", "2A d"]);
    expect(scenes()[0]!.shots.map((sh) => sh.order)).toEqual([0, 1, 2]);
  });

  it("moves a shot to another scene before a given shot", () => {
    const { s1, s2, b, d } = seed();
    store().reorderShots(b, s1, s2, d);
    expect(shotLabels()).toEqual(["1A a", "1B c", "2A b", "2B d"]);
  });

  it("moves a shot to the end of another scene when no target shot is given", () => {
    const { s1, s2, b } = seed();
    store().reorderShots(b, s1, s2, null);
    expect(shotLabels()).toEqual(["1A a", "1B c", "2A d", "2B b"]);
  });

  it("scene numbers ripple when scenes move, and linked lines stay linked", () => {
    const { s1, s2, a } = seed();
    store().addLine(makeLine("line-1", a));
    store().reorderScenes(s2, s1);
    expect(scenes().map((s) => [s.id, s.order])).toEqual([
      [s2, 0],
      [s1, 1],
    ]);
    expect(shotLabels()).toEqual(["1A d", "2A a", "2B b", "2C c"]);
    expect(project().annotations[0]).toMatchObject({ id: "line-1", shotId: a });
  });

  it("ignores moves with unknown IDs", () => {
    const { s1 } = seed();
    const before = project();
    store().reorderScenes("nope", s1);
    store().reorderShots("nope", s1, s1, null);
    expect(project()).toBe(before);
  });
});

describe("projectStore: delete", () => {
  it("deleting a shot ripples the IDs after it and clears its selection", () => {
    const { s1, a } = seed();
    store().selectShot(s1, a);
    store().deleteShot(s1, a);
    expect(shotLabels()).toEqual(["1A b", "1B c", "2A d"]);
    expect(store().selection).toBeNull();
  });

  it("deleting a shot leaves its lines in place, still pointing at it", () => {
    const { s1, a } = seed();
    store().addLine(makeLine("line-1", a));
    store().deleteShot(s1, a);
    expect(project().annotations).toHaveLength(1);
    expect(project().annotations[0]).toMatchObject({ id: "line-1", shotId: a });
  });

  it("deleteLinesForShot removes only that shot's lines", () => {
    const { a, b } = seed();
    store().addLine(makeLine("line-a1", a));
    store().addLine(makeLine("line-a2", a));
    store().addLine(makeLine("line-b", b));
    store().addLine(makeLine("line-free"));
    store().deleteLinesForShot(a);
    expect(project().annotations.map((x) => x.id)).toEqual(["line-b", "line-free"]);
  });

  it("deleting a scene removes its shots, renumbers the rest and clears its selection", () => {
    const { s1, s2 } = seed();
    store().setSceneCollapsed(s1, true);
    store().selectScene(s1);
    store().deleteScene(s1);
    expect(scenes().map((s) => [s.id, s.order])).toEqual([[s2, 0]]);
    expect(shotLabels()).toEqual(["1A d"]);
    expect(store().selection).toBeNull();
    expect(store().collapsedSceneIds).toEqual({});
  });

  it("deleting a mark clears the selection only when that mark was selected", () => {
    store().addLine(makeLine("line-1"));
    store().addLine(makeLine("line-2"));
    store().deleteAnnotation("line-1");
    expect(store().selection).toEqual({ kind: "annotation", annotationId: "line-2" });
    store().deleteAnnotation("line-2");
    expect(store().selection).toBeNull();
    expect(project().annotations).toEqual([]);
  });
});

describe("projectStore: copy, paste, duplicate", () => {
  it("pastes a copied line onto another page with a new ID and the same shot link", () => {
    const { a } = seed();
    store().addLine(makeLine("line-1", a));
    store().copySelectedLines();
    store().pasteLines(3);
    const [original, pasted] = project().annotations as [LineAnnotation, LineAnnotation];
    expect(pasted.id).not.toBe(original.id);
    expect(pasted).toMatchObject({ kind: "line", page: 3, shotId: a, style: original.style });
    expect(store().selection).toEqual({ kind: "annotation", annotationId: pasted.id });
  });

  it("duplicates a line on the same page and selects the copy", () => {
    store().addLine(makeLine("line-1"));
    store().duplicateLine("line-1");
    const [original, copy] = project().annotations as [LineAnnotation, LineAnnotation];
    expect(copy.id).not.toBe(original.id);
    expect(copy.page).toBe(original.page);
    expect(store().selection).toEqual({ kind: "annotation", annotationId: copy.id });
  });
});

describe("projectStore: new and load", () => {
  it("newProject clears the project and selection", () => {
    seed();
    store().addLine(makeLine("line-1"));
    store().newProject();
    expect(scenes()).toEqual([]);
    expect(project().annotations).toEqual([]);
    expect(project().name).toBe("Untitled");
    expect(store().selection).toBeNull();
  });

  it("loadProject replaces the project and resets the view", () => {
    seed();
    const saved = project();
    store().newProject();
    store().setViewerPage(4);
    store().loadProject({ ...saved, name: "Loaded" });
    expect(project().name).toBe("Loaded");
    expect(shotLabels()).toEqual(["1A a", "1B b", "1C c", "2A d"]);
    expect(store().selection).toBeNull();
    expect(store().viewerPage).toBe(1);
  });
});
