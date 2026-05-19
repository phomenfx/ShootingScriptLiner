import { describe, expect, it } from "vitest";
import {
  normalizeToolKey,
  sanitizeToolKeybinds,
  toolForKey,
  validateToolKeybindChange,
} from "./toolKeybinds";
import { DEFAULT_TOOL_KEYBINDS } from "../types/toolKeybinds";

describe("toolKeybinds", () => {
  it("normalizes letter keys", () => {
    expect(normalizeToolKey("V")).toBe("v");
    expect(normalizeToolKey("1")).toBeNull();
  });

  it("maps key to tool", () => {
    expect(toolForKey("l", DEFAULT_TOOL_KEYBINDS)).toBe("line");
  });

  it("rejects duplicate keys", () => {
    const r = validateToolKeybindChange(DEFAULT_TOOL_KEYBINDS, "line", "v");
    expect(r.ok).toBe(false);
  });

  it("sanitizes invalid stored binds", () => {
    const s = sanitizeToolKeybinds({ select: "1", line: "l", text: "l" });
    expect(s.line).toBe("l");
    expect(s.text).toBe("t");
  });
});
