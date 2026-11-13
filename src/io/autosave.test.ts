import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProject, createScene } from "../model/defaults";
import { addScene } from "../model/edits";
import { markProjectSaved, replaceProject, useProjectStore } from "../stores/projectStore";
import { readAutosave, startAutosave } from "./autosave";

describe("autosave", () => {
  const store = new Map<string, string>();
  let stop: () => void = () => {};

  beforeEach(() => {
    vi.useFakeTimers();
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    replaceProject(createProject());
    stop = startAutosave();
  });

  afterEach(() => {
    stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps unsaved work a few seconds after a change and drops it once saved", () => {
    useProjectStore.getState().apply(addScene(createScene({ indicator: "INT.", location: "KITCHEN", time: "DAY" })));
    expect(readAutosave()).toBeNull();
    vi.advanceTimersByTime(3500);
    expect(readAutosave()?.json).toContain("KITCHEN");
    markProjectSaved();
    expect(readAutosave()).toBeNull();
  });
});
