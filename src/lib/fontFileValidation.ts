/** Validate raw bytes before FontFace / pdf-lib embed. */

export type FontValidationResult =
  | { ok: true; format: "truetype" | "opentype" }
  | { ok: false; reason: string };

export function validateFontBytes(
  bytes: Uint8Array,
  fileName: string
): FontValidationResult {
  if (bytes.byteLength < 4) {
    return { ok: false, reason: `${fileName} is empty.` };
  }

  const b0 = bytes[0]!;
  const b1 = bytes[1]!;
  const b2 = bytes[2]!;
  const b3 = bytes[3]!;
  const sig4 = String.fromCharCode(b0, b1, b2, b3);

  // TrueType outlines (sfnt version 0x00010000)
  if (b0 === 0 && b1 === 1 && b2 === 0 && b3 === 0) {
    return { ok: true, format: "truetype" };
  }
  // CFF OpenType
  if (sig4 === "OTTO") {
    return { ok: true, format: "opentype" };
  }
  // Legacy TrueType signatures
  if (sig4 === "true" || sig4 === "typ1") {
    return { ok: true, format: "truetype" };
  }

  if (sig4 === "ttcf") {
    return {
      ok: false,
      reason: `${fileName} is a TrueType Collection (.ttc), not a single .ttf. Copy the individual face from C:\\Windows\\Fonts\\ (see public/fonts/README.md).`,
    };
  }

  if (sig4 === "wOFF" || sig4 === "wOF2") {
    return {
      ok: false,
      reason: `${fileName} is WOFF/WOFF2. Rename won't work — copy a .ttf or .otf from C:\\Windows\\Fonts\\.`,
    };
  }

  if (sig4.startsWith("<") || sig4.startsWith("<?") || sig4 === "HTML" || sig4 === "<!DO") {
    return {
      ok: false,
      reason: `${fileName} is not a font (looks like HTML/XML). The file may be missing — Vite returned a web page — or the copy failed.`,
    };
  }

  return {
    ok: false,
    reason: `${fileName} is not a valid TTF/OTF (unexpected header "${sig4}"). Copy real font files from C:\\Windows\\Fonts\\.`,
  };
}

export function formatFontLoadError(fileName: string, reason: string): string {
  return `Font "${fileName}": ${reason}`;
}
