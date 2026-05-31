import { describe, expect, it } from "vitest";
import { collectProjectFontFamilies } from "./projectFonts";
import { DEFAULT_PROJECT } from "../types/project";
import type { LineAnnotation } from "../types/annotations";

describe("collectProjectFontFamilies", () => {
  it("includes default and per-annotation families", () => {
    const line: LineAnnotation = {
      id: "l1",
      kind: "line",
      page: 1,
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
      style: DEFAULT_PROJECT.defaultLine.style,
      fontFamily: '"Georgia", serif',
      fontSizePt: 11,
      labelBold: false,
      showLabel: true,
      visible: true,
    };
    const project = {
      ...DEFAULT_PROJECT,
      annotations: [line],
    };
    const families = collectProjectFontFamilies(project);
    expect(families).toContain(DEFAULT_PROJECT.defaultLine.fontFamily);
    expect(families).toContain('"Georgia", serif');
  });
});
