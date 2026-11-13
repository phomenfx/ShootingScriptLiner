import { describe, expect, it } from "vitest";
import { shellMode } from "./panelLayout";

describe("window layouts", () => {
  it("open both panels when wide, one at a time narrower, and slide over when narrowest", () => {
    expect(shellMode(1400)).toBe("wide");
    expect(shellMode(1024)).toBe("compact");
    expect(shellMode(768)).toBe("compact");
    expect(shellMode(700)).toBe("narrow");
  });
});
