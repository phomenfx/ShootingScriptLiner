import fontkit from "@pdf-lib/fontkit";
import type { PDFDocument, PDFFont } from "pdf-lib";
import {
  findBundledFont,
  loadBundledFontBytes,
  loadFontManifest,
  parseFontFamilies,
  type BundledFontEntry,
} from "./bundledFonts";

const fontCacheByDoc = new WeakMap<PDFDocument, Map<string, Promise<PDFFont>>>();
const fontkitDocs = new WeakSet<PDFDocument>();

function getDocCache(doc: PDFDocument): Map<string, Promise<PDFFont>> {
  let cache = fontCacheByDoc.get(doc);
  if (!cache) {
    cache = new Map();
    fontCacheByDoc.set(doc, cache);
  }
  return cache;
}

function ensureFontkit(doc: PDFDocument): void {
  if (!fontkitDocs.has(doc)) {
    doc.registerFontkit(fontkit);
    fontkitDocs.add(doc);
  }
}

function cacheKeyForSubset(baseKey: string, subset: boolean): string {
  return subset ? baseKey : `${baseKey}:full`;
}

async function embedTtf(
  doc: PDFDocument,
  baseKey: string,
  bytes: ArrayBuffer,
  subset: boolean
): Promise<PDFFont> {
  ensureFontkit(doc);
  const key = cacheKeyForSubset(baseKey, subset);
  const docCache = getDocCache(doc);
  let pending = docCache.get(key);
  if (!pending) {
    const copy = new Uint8Array(bytes);
    pending = doc.embedFont(copy, { subset });
    docCache.set(key, pending);
  }
  return pending;
}

/** Ensure every character encodes; throws if the face cannot represent the text. */
function assertEncodable(font: PDFFont, sample: string): void {
  const text = sample.trim() || "Aa0";
  font.encodeText(text);
  font.widthOfTextAtSize(text, 12);
}

function clearEmbedCache(doc: PDFDocument, baseKey: string): void {
  const docCache = getDocCache(doc);
  docCache.delete(baseKey);
  docCache.delete(cacheKeyForSubset(baseKey, false));
}

/**
 * Embed bytes with subsetting first, then full font if subset fails.
 * Exported for unit tests.
 */
export async function embedBundledFaceForExport(
  doc: PDFDocument,
  baseKey: string,
  bytes: ArrayBuffer,
  sample: string
): Promise<PDFFont | null> {
  try {
    const font = await embedTtf(doc, baseKey, bytes, true);
    assertEncodable(font, sample);
    return font;
  } catch (err) {
    clearEmbedCache(doc, baseKey);
    console.warn(`PDF export: subset embed failed for ${baseKey}`, err);
  }

  try {
    const font = await embedTtf(doc, baseKey, bytes, false);
    assertEncodable(font, sample);
    return font;
  } catch (err) {
    clearEmbedCache(doc, baseKey);
    console.warn(`PDF export: full embed failed for ${baseKey}`, err);
    return null;
  }
}

async function tryEmbedFace(
  doc: PDFDocument,
  entry: BundledFontEntry,
  bold: boolean,
  sample: string
): Promise<PDFFont | null> {
  const baseKey = `${entry.family}:${bold ? "bold" : "regular"}`;
  try {
    const bytes = await loadBundledFontBytes(entry, bold);
    return await embedBundledFaceForExport(doc, baseKey, bytes, sample);
  } catch (err) {
    console.warn(
      `PDF export: could not load ${entry.family} (${bold ? "bold" : "regular"})`,
      err
    );
    clearEmbedCache(doc, baseKey);
    return null;
  }
}

/**
 * Embed a bundled TTF from public/fonts for PDF export.
 * Uses subsetting when possible; falls back to full embed, then regular if bold fails
 * (common with Windows Courier New Bold).
 */
export async function resolvePdfExportFont(
  doc: PDFDocument,
  fontFamily: string,
  bold: boolean,
  sampleText = "ABCabc123 ()-."
): Promise<PDFFont> {
  const manifest = await loadFontManifest();
  const entry = findBundledFont(manifest, fontFamily);
  if (!entry) {
    const names = parseFontFamilies(fontFamily).join(", ") || fontFamily;
    throw new Error(
      `Unknown font "${names}". Add it to public/fonts/manifest.json and place the TTF files in public/fonts/.`
    );
  }

  if (bold) {
    const boldFont = await tryEmbedFace(doc, entry, true, sampleText);
    if (boldFont) return boldFont;
  }

  const regular = await tryEmbedFace(doc, entry, false, sampleText);
  if (regular) return regular;

  const fileName = bold ? entry.bold : entry.regular;
  throw new Error(
    `Could not embed "${entry.family}" for PDF export. Re-copy ${fileName} from C:\\Windows\\Fonts\\ (see public/fonts/README.md).`
  );
}

export { parseFontFamilies, sanitizePdfExportText } from "./bundledFonts";
