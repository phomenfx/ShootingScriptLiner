import { arrayMove } from "@dnd-kit/sortable";
import { describe, expect, it } from "vitest";
import {
  assignShotOrders,
  formatShotLabel,
  getSortedShots,
  indexToLetters,
  renumberAll,
  sceneNumber,
} from "./labelUtils";
import type { Scene, Shot } from "../types/project";
import { newId } from "./ids";

function shot(order: number, extra: Partial<Shot> = {}): Shot {
  return {
    id: newId(),
    order,
    color: "#FF0000",
    visible: true,
    shotType: "WS",
    subject: "Subject",
    ...extra,
  };
}

function scene(order: number, shots: Shot[], slugline = ""): Scene {
  return {
    id: newId(),
    slugline,
    order,
    visible: true,
    shots,
  };
}

describe("indexToLetters", () => {
  it("maps Excel-style", () => {
    expect(indexToLetters(0)).toBe("A");
    expect(indexToLetters(25)).toBe("Z");
    expect(indexToLetters(26)).toBe("AA");
  });
});

describe("renumber ripple", () => {
  it("moving scene 5 between 2 and 3 renumbers scenes and 5A to 3A", () => {
    const scenes: Scene[] = [];
    for (let i = 0; i < 5; i++) {
      const sh = shot(0);
      scenes.push(scene(i, [sh]));
    }
    const sorted = renumberAll(scenes);
    const scene5 = sorted[4];
    const movingShot = scene5.shots[0];

    const reordered = [...sorted];
    const [removed] = reordered.splice(4, 1);
    reordered.splice(2, 0, removed);
    const next = renumberAll(reordered);

    const was5 = next.find((s) => s.shots.some((sh) => sh.id === movingShot.id))!;
    expect(sceneNumber(was5, next)).toBe(3);
    expect(formatShotLabel(was5, was5.shots[0], next, "letter")).toBe(
      "3A-WS Subject"
    );
  });
});

describe("formatShotLabel additional info", () => {
  it("combines label and additional info in parentheses", () => {
    const sh = shot(0, { subject: "Subject", slug: "Moving Master" });
    const sc = scene(0, [sh]);
    const scenes = renumberAll([sc]);
    expect(
      formatShotLabel(scenes[0], scenes[0].shots[0], scenes, "letter", "parens")
    ).toBe("1A-WS Subject (Moving Master)");
  });

  it("combines label and additional info with hyphen", () => {
    const sh = shot(0, { subject: "Subject", slug: "Moving Master" });
    const sc = scene(0, [sh]);
    const scenes = renumberAll([sc]);
    expect(
      formatShotLabel(scenes[0], scenes[0].shots[0], scenes, "letter", "hyphen")
    ).toBe("1A-WS Subject - Moving Master");
  });
});

describe("shot reorder within scene", () => {
  it("moves shot B onto shot D position", () => {
    const shots = [
      shot(0, { subject: "A" }),
      shot(1, { subject: "B" }),
      shot(2, { subject: "C" }),
      shot(3, { subject: "D" }),
    ];
    const moved = arrayMove(shots, 1, 3);
    expect(moved.map((s) => s.subject)).toEqual(["A", "C", "D", "B"]);
  });

  it("renumberAll keeps drag order when shot order fields are synced", () => {
    const sc = scene(0, [
      shot(0, { subject: "A" }),
      shot(1, { subject: "B" }),
      shot(2, { subject: "C" }),
      shot(3, { subject: "D" }),
    ]);
    const moved = assignShotOrders(arrayMove(getSortedShots(sc), 1, 3));
    const scenes = renumberAll([{ ...sc, shots: moved }]);
    expect(scenes[0].shots.map((s) => s.subject)).toEqual(["A", "C", "D", "B"]);
  });

  it("renumberAll reverts drag if shot order fields are stale", () => {
    const sc = scene(0, [
      shot(0, { subject: "A" }),
      shot(1, { subject: "B" }),
      shot(2, { subject: "C" }),
      shot(3, { subject: "D" }),
    ]);
    const moved = arrayMove(getSortedShots(sc), 1, 3);
    const scenes = renumberAll([{ ...sc, shots: moved }]);
    expect(scenes[0].shots.map((s) => s.subject)).toEqual(["A", "B", "C", "D"]);
  });
});

describe("parse roundtrip", () => {
  it("serializes project", async () => {
    const { serializeProject, parseProject } = await import("./labelUtils");
    const { DEFAULT_PROJECT } = await import("../types/project");
    const p = {
      ...DEFAULT_PROJECT,
      name: "Test",
      scenes: renumberAll([scene(0, [shot(0)])]),
    };
    const back = parseProject(serializeProject(p));
    expect(back.name).toBe("Test");
    expect(back.scenes[0].shots[0].order).toBe(0);
  });
});
