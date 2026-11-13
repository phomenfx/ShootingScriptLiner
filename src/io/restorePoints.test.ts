import { beforeEach, describe, expect, it, vi } from "vitest";
import { addRestorePoint, readRestorePoints } from "./autosave";

describe("restore points", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });
  const at = (minutes: number, name = "A") => ({ savedAt: new Date(Date.UTC(2026, 0, 1, 0, minutes)).toISOString(), name, json: "{}" });

  it("keep a copy about every 5 minutes, newest first, up to the limit", () => {
    addRestorePoint(at(0), 3);
    addRestorePoint(at(2), 3); // too soon
    addRestorePoint(at(5), 3);
    addRestorePoint(at(10), 3);
    addRestorePoint(at(15), 3);
    expect(readRestorePoints().map((p) => p.savedAt.slice(14, 16))).toEqual(["15", "10", "05"]);
  });

  it("start a new copy right away for another project, and keep none when set to 0", () => {
    addRestorePoint(at(0, "A"), 5);
    addRestorePoint(at(1, "B"), 5);
    expect(readRestorePoints().map((p) => p.name)).toEqual(["B", "A"]);
    store.clear();
    addRestorePoint(at(0), 0);
    expect(readRestorePoints()).toEqual([]);
  });
});
