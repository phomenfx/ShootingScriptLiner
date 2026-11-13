/**
 * Works out which script PDF a project belongs to: its page sizes (the
 * coordinate system for every mark) and a fingerprint of the file.
 */
import type { ScriptInfo, ScriptPage } from "../model/types";

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Reads page sizes as displayed (after rotation) and fingerprints the file. */
export async function describeScript(bytes: ArrayBuffer, fileName: string): Promise<ScriptInfo> {
  const [fingerprint, doc] = await Promise.all([
    sha256Hex(bytes),
    import("pdf-lib").then(({ PDFDocument }) => PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })),
  ]);
  const pages: ScriptPage[] = doc.getPages().map((page) => {
    const box = page.getCropBox();
    const rotation = (((page.getRotation().angle % 360) + 360) % 360);
    const sideways = rotation === 90 || rotation === 270;
    return {
      widthPt: sideways ? box.height : box.width,
      heightPt: sideways ? box.width : box.height,
      rotation,
    };
  });
  return { fileName, pageCount: pages.length, pages, fingerprint };
}

export type ScriptMatch =
  /** Nothing to compare against: the project had not seen its script yet. */
  | "unknown"
  | "same"
  /** Same number of pages but a different file: a re-export or a revised draft. */
  | "changed"
  | "pageCountChanged";

export function compareScript(saved: ScriptInfo | undefined, actual: ScriptInfo): ScriptMatch {
  if (!saved || !saved.fingerprint) return "unknown";
  if (saved.fingerprint === actual.fingerprint) return "same";
  return saved.pageCount === actual.pageCount ? "changed" : "pageCountChanged";
}

export function scriptMismatchMessage(
  match: ScriptMatch,
  saved: ScriptInfo | undefined,
  actual: ScriptInfo
): string | null {
  if (match === "changed") {
    return `"${actual.fileName}" is not the same file this project was lined on. Lines and notes may not sit where they should.`;
  }
  if (match === "pageCountChanged") {
    return `"${actual.fileName}" has ${actual.pageCount} pages, but this project was lined on a script with ${saved?.pageCount ?? 0} pages. Lines and notes will not match the script.`;
  }
  return null;
}
