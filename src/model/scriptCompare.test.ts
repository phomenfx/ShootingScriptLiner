import { describe, expect, it } from "vitest";
import { compareScripts, pageSimilarity } from "./scriptCompare";

const page = (tag: string) => Array.from({ length: 6 }, (_, i) => `${tag} line ${i}`);

describe("comparing an updated script", () => {
  it("scores pages by shared lines", () => {
    expect(pageSimilarity(["a", "b"], ["a", "b"])).toBe(1);
    expect(pageSimilarity(["a", "b"], ["a", "c"])).toBe(0.5);
  });

  it("keeps marks on their page when a page is added before them", () => {
    const old = [page("A"), page("B"), page("C")];
    const updated = [page("A"), page("NEW"), page("B"), page("C")];
    const c = compareScripts(old, updated);
    expect(c.pageMap).toEqual([1, 3, 4]);
    expect(c.added).toEqual([2]);
    expect(c.changed).toEqual([2]);
    expect(c.removed).toEqual([]);
  });

  it("points out a changed page and follows a removed one", () => {
    const b2 = [...page("B").slice(0, 5), "a rewritten line"];
    const c = compareScripts([page("A"), page("B"), page("C"), page("D")], [page("A"), b2, page("D")]);
    expect(c.pageMap).toEqual([1, 2, 3, 3]);
    expect(c.changed).toEqual([2]);
    expect(c.removed).toEqual([3]);
  });
});
