#!/usr/bin/env node
/**
 * Verify bundled fonts in public/fonts/ match manifest.json.
 * Run: node scripts/verify-fonts.mjs
 */
import { readFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const fontsDir = join(root, "public", "fonts");
const manifestPath = join(fontsDir, "manifest.json");

function validateFontBytes(bytes, fileName) {
  if (bytes.byteLength < 4) {
    return { ok: false, reason: `${fileName} is empty.` };
  }
  const b0 = bytes[0];
  const b1 = bytes[1];
  const b2 = bytes[2];
  const b3 = bytes[3];
  const sig4 = String.fromCharCode(b0, b1, b2, b3);

  if (b0 === 0 && b1 === 1 && b2 === 0 && b3 === 0) {
    return { ok: true, format: "truetype" };
  }
  if (sig4 === "OTTO") {
    return { ok: true, format: "opentype" };
  }
  if (sig4 === "true" || sig4 === "typ1") {
    return { ok: true, format: "truetype" };
  }
  if (sig4 === "ttcf") {
    return {
      ok: false,
      reason: `${fileName} is a TrueType Collection (.ttc). Copy individual .ttf faces from C:\\Windows\\Fonts\\.`,
    };
  }
  if (sig4 === "wOFF" || sig4 === "wOF2") {
    return {
      ok: false,
      reason: `${fileName} is WOFF/WOFF2. Copy a .ttf or .otf from C:\\Windows\\Fonts\\.`,
    };
  }
  if (sig4.startsWith("<") || sig4.startsWith("<?") || sig4 === "HTML" || sig4 === "<!DO") {
    return {
      ok: false,
      reason: `${fileName} is not a font (looks like HTML/XML). The file may be missing from public/fonts/.`,
    };
  }
  return {
    ok: false,
    reason: `${fileName} is not a valid TTF/OTF (unexpected header "${sig4}").`,
  };
}

async function fileExists(path) {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function checkFontFile(fileName) {
  const path = join(fontsDir, fileName);
  if (!(await fileExists(path))) {
    return { ok: false, reason: `missing file public/fonts/${fileName}` };
  }
  const buf = await readFile(path);
  return validateFontBytes(buf, fileName);
}

async function main() {
  const manifestRaw = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestRaw);
  const errors = [];

  for (const entry of manifest.fonts) {
    for (const role of ["regular", "bold"]) {
      const fileName = entry[role];
      const label = `${entry.family} (${role}: ${fileName})`;
      const result = await checkFontFile(fileName);
      if (result.ok) {
        console.log(`OK  ${label} [${result.format}]`);
      } else {
        console.error(`FAIL ${label}: ${result.reason}`);
        errors.push(label);
      }
    }
  }

  if (errors.length > 0) {
    console.error(`\n${errors.length} font file(s) failed. See public/fonts/README.md.`);
    process.exit(1);
  }
  console.log("\nAll manifest fonts verified.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
