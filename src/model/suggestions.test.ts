import { describe, expect, it } from "vitest";
import { createProject } from "./defaults";
import { BUILT_IN_SUGGESTIONS, defaultsFromProject, rememberSuggestions, suggestionsFor } from "./suggestions";

describe("suggestion lists", () => {
  it("use the project's list, else my defaults, else the built-in one", () => {
    const p = createProject();
    expect(suggestionsFor(p, "fps", {})).toEqual(BUILT_IN_SUGGESTIONS.fps);
    expect(suggestionsFor(p, "fps", { fps: ["24"] })).toEqual(["24"]);
    p.settings.suggestions = { fps: ["25"] };
    expect(suggestionsFor(p, "fps", { fps: ["24"] })).toEqual(["25"]);
  });

  it("keep cast with the project, never in my defaults", () => {
    const p = createProject();
    p.settings.suggestions = { cast: ["Alex"], system: ["Sticks"] };
    const mine = defaultsFromProject(p, {});
    expect(mine.cast).toBeUndefined();
    expect(mine.system).toEqual(["Sticks"]);
    expect(suggestionsFor(createProject(), "cast", { cast: ["Leaked"] })).toEqual([]);
  });

  it("add typed values that are new, once", () => {
    const p = createProject();
    const next = rememberSuggestions(p.settings, "cast", [], ["Alex", "alex ", "Sam"]);
    expect(next.suggestions?.cast).toEqual(["Alex", "Sam"]);
    expect(rememberSuggestions(next, "cast", ["Alex", "Sam"], ["sam"])).toBe(next);
  });
});
