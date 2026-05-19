import { describe, expect, it, vi } from "vitest";
import type { PDFDocument, PDFFont } from "pdf-lib";
import {
  cssFontFamily,
  findBundledFont,
  parseFontFamilies,
  sanitizePdfExportText,
  type FontManifest,
} from "./bundledFonts";
import { embedBundledFaceForExport } from "./pdfExportFonts";

const SAMPLE_MANIFEST: FontManifest = {
  fonts: [
    {
      family: "Consolas",
      label: "Consolas",
      regular: "Consolas.ttf",
      bold: "Consolas-Bold.ttf",
      category: "monospace",
    },
    {
      family: "Arial",
      label: "Arial",
      regular: "Arial.ttf",
      bold: "Arial-Bold.ttf",
      category: "sans-serif",
    },
  ],
};

const FAKE_BYTES = new ArrayBuffer(8);

function mockFont(id: string): PDFFont {
  return {
    encodeText: vi.fn(),
    widthOfTextAtSize: vi.fn(),
    name: id,
  } as unknown as PDFFont;
}

function createMockDoc(id: string) {
  const embedFont = vi.fn(async (_bytes: Uint8Array, opts?: { subset?: boolean }) => {
    return mockFont(`${id}:${opts?.subset ? "subset" : "full"}`);
  });
  return {
    id,
    registerFontkit: vi.fn(),
    embedFont,
  } as unknown as PDFDocument & { embedFont: ReturnType<typeof vi.fn> };
}

describe("parseFontFamilies", () => {
  it("splits CSS stacks and strips quotes", () => {
    expect(parseFontFamilies('"Consolas", monospace')).toEqual(["Consolas", "monospace"]);
  });
});

describe("findBundledFont", () => {
  it("matches by primary family name", () => {
    const hit = findBundledFont(SAMPLE_MANIFEST, '"Consolas", monospace');
    expect(hit?.family).toBe("Consolas");
    expect(cssFontFamily(hit!)).toBe('"Consolas", monospace');
  });
});

describe("sanitizePdfExportText", () => {
  it("keeps ASCII labels", () => {
    expect(sanitizePdfExportText("1A (cont.)")).toBe("1A (cont.)");
  });
});

describe("embedBundledFaceForExport", () => {
  it("does not share embedded fonts across PDF documents", async () => {
    const docA = createMockDoc("A");
    const docB = createMockDoc("B");

    const fontA = await embedBundledFaceForExport(docA, "Arial:regular", FAKE_BYTES, "Aa0");
    const fontB = await embedBundledFaceForExport(docB, "Arial:regular", FAKE_BYTES, "Aa0");

    expect(fontA).not.toBeNull();
    expect(fontB).not.toBeNull();
    expect(fontA).not.toBe(fontB);
    expect(docA.embedFont).toHaveBeenCalledTimes(1);
    expect(docB.embedFont).toHaveBeenCalledTimes(1);
  });

  it("reuses cached font for the same document and key", async () => {
    const doc = createMockDoc("A");
    const first = await embedBundledFaceForExport(doc, "Arial:regular", FAKE_BYTES, "Aa0");
    const second = await embedBundledFaceForExport(doc, "Arial:regular", FAKE_BYTES, "Aa0");

    expect(first).toBe(second);
    expect(doc.embedFont).toHaveBeenCalledTimes(1);
  });

  it("falls back to full embed when subset embed fails", async () => {
    const doc = createMockDoc("A");
    doc.embedFont.mockImplementation(async (_bytes: Uint8Array, opts?: { subset?: boolean }) => {
      if (opts?.subset) throw new Error("subset failed");
      return mockFont("A:full");
    });

    const font = await embedBundledFaceForExport(doc, "Calibri:regular", FAKE_BYTES, "Aa0");

    expect(font).not.toBeNull();
    expect(doc.embedFont).toHaveBeenCalledTimes(2);
    expect(doc.embedFont.mock.calls[0]![1]).toEqual({ subset: true });
    expect(doc.embedFont.mock.calls[1]![1]).toEqual({ subset: false });
  });

  it("returns null when both subset and full embed fail", async () => {
    const doc = createMockDoc("A");
    doc.embedFont.mockRejectedValue(new Error("embed failed"));

    const font = await embedBundledFaceForExport(doc, "Arial:regular", FAKE_BYTES, "Aa0");

    expect(font).toBeNull();
    expect(doc.embedFont).toHaveBeenCalledTimes(2);
  });
});
