import { describe, expect, it } from "vitest";
import { choiceLabel, keyForTypedText } from "./registry";

describe("keyForTypedText", () => {
  it("keeps typed angles as typed", () => {
    for (const typed of ["OTS", "ots", "eye", "Over the shoulder", "Low", "Birds Eye"]) {
      expect(choiceLabel("angle", keyForTypedText("angle", typed))).toBe(typed);
    }
  });

  it("still shows old saved keys as their labels", () => {
    expect(choiceLabel("angle", "ots")).toBe("Over the shoulder");
  });

  it("clears on empty text", () => {
    expect(keyForTypedText("angle", "  ")).toBe("");
  });
});
