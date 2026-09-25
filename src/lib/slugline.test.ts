import { describe, expect, it } from "vitest";
import { composeSlugline, splitSlugline } from "./slugline";

describe("slugline", () => {
  it("joins the three name parts", () => {
    expect(composeSlugline("INT.", "BEDROOM", "DAY")).toBe("INT. BEDROOM - DAY");
    expect(composeSlugline("", "BEDROOM", "")).toBe("BEDROOM");
    expect(composeSlugline("EXT.", "", "NIGHT")).toBe("EXT. - NIGHT");
    expect(composeSlugline("", "ALLEY", "NIGHT")).toBe("ALLEY - NIGHT");
  });

  it("splits a leading indicator and a trailing time", () => {
    expect(splitSlugline("INT. BEDROOM - DAY")).toEqual({
      indicator: "INT.",
      location: "BEDROOM",
      timeOfDay: "DAY",
    });
    expect(splitSlugline("ext. STREET - NIGHT")).toEqual({
      indicator: "EXT.",
      location: "STREET",
      timeOfDay: "NIGHT",
    });
    expect(splitSlugline("INT./EXT. CAR - DAY")).toEqual({
      indicator: "INT./EXT.",
      location: "CAR",
      timeOfDay: "DAY",
    });
    expect(splitSlugline("Entry Room")).toEqual({
      indicator: "",
      location: "Entry Room",
      timeOfDay: "",
    });
  });
});
