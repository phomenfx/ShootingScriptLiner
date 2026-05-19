import { describe, expect, it } from "vitest";
import { validateFontBytes } from "./fontFileValidation";

describe("validateFontBytes", () => {
  it("accepts TrueType signature", () => {
    const bytes = new Uint8Array([0, 1, 0, 0, 0, 0]);
    expect(validateFontBytes(bytes, "test.ttf")).toEqual({ ok: true, format: "truetype" });
  });

  it("rejects HTML/XML", () => {
    const bytes = new Uint8Array([0x3c, 0x3f, 0x78, 0x6d]);
    const r = validateFontBytes(bytes, "bad.ttf");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("HTML");
  });

  it("rejects TTC", () => {
    const bytes = new Uint8Array([0x74, 0x74, 0x63, 0x66]);
    const r = validateFontBytes(bytes, "coll.ttc");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("Collection");
  });
});
