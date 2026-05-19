export type FontCategory = "monospace" | "sans-serif" | "serif";

export type BundledFontEntry = {
  family: string;
  label: string;
  regular: string;
  bold: string;
  category: FontCategory;
};

export type FontManifest = {
  fonts: BundledFontEntry[];
};

export type FontOption = { value: string; label: string };

let manifestCache: FontManifest | null = null;
const ttfBytesCache = new Map<string, Promise<ArrayBuffer>>();
const loadErrors: string[] = [];

export function getBundledFontLoadErrors(): readonly string[] {
  return loadErrors;
}

export function parseFontFamilies(fontFamily: string): string[] {
  return fontFamily
    .split(",")
    .map((part) => part.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

export function cssFontFamily(entry: BundledFontEntry): string {
  return `"${entry.family}", ${entry.category}`;
}

export async function loadFontManifest(): Promise<FontManifest> {
  if (manifestCache) return manifestCache;
  const res = await fetch("/fonts/manifest.json");
  if (!res.ok) throw new Error("Could not load public/fonts/manifest.json");
  manifestCache = (await res.json()) as FontManifest;
  return manifestCache;
}

export function findBundledFont(
  manifest: FontManifest,
  fontFamily: string
): BundledFontEntry | null {
  const wanted = new Set(
    parseFontFamilies(fontFamily).map((f) => f.trim().toLowerCase())
  );
  for (const entry of manifest.fonts) {
    if (wanted.has(entry.family.toLowerCase())) return entry;
  }
  return null;
}

export function defaultBundledFont(manifest: FontManifest): BundledFontEntry {
  return manifest.fonts.find((f) => f.family === "Arial") ?? manifest.fonts[0]!;
}

async function fetchAndValidateFont(fileName: string): Promise<ArrayBuffer> {
  const { validateFontBytes, formatFontLoadError } = await import("./fontFileValidation");
  const res = await fetch(`/fonts/${encodeURIComponent(fileName)}`);
  if (!res.ok) {
    throw new Error(
      formatFontLoadError(
        fileName,
        `file not found (HTTP ${res.status}). Place it in public/fonts/.`
      )
    );
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    throw new Error(
      formatFontLoadError(
        fileName,
        "server returned HTML — the file is probably missing from public/fonts/."
      )
    );
  }
  const buf = await res.arrayBuffer();
  const check = validateFontBytes(new Uint8Array(buf), fileName);
  if (!check.ok) {
    throw new Error(formatFontLoadError(fileName, check.reason));
  }
  return buf;
}

function fontMimeType(fileName: string): string {
  return fileName.toLowerCase().endsWith(".otf") ? "font/otf" : "font/ttf";
}

/** Load via blob URL (works better in Firefox than raw ArrayBuffer). */
async function loadFontFaceFromBytes(
  entry: BundledFontEntry,
  bytes: ArrayBuffer,
  fileName: string,
  weight: "400" | "700"
): Promise<void> {
  const url = URL.createObjectURL(new Blob([bytes], { type: fontMimeType(fileName) }));
  try {
    const face = new FontFace(entry.family, `url(${url})`, {
      weight,
      style: "normal",
    });
    await face.load();
    document.fonts.add(face);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Viewer fonts: load from `/fonts/` URL so the browser's native loader runs
 * (Firefox rejects some Windows faces when passed as ArrayBuffer — e.g. Calibri kern).
 */
async function loadFontFace(
  entry: BundledFontEntry,
  fileName: string,
  weight: "400" | "700"
): Promise<void> {
  const url = `/fonts/${encodeURIComponent(fileName)}`;
  const face = new FontFace(entry.family, `url("${url}")`, {
    weight,
    style: "normal",
  });
  try {
    await face.load();
    document.fonts.add(face);
  } catch {
    const bytes = await fetchAndValidateFont(fileName);
    await loadFontFaceFromBytes(entry, bytes, fileName, weight);
  }
}

/** Register TTFs/OTFs for the script viewer (FontFace API). */
export async function registerBundledFontsForViewer(): Promise<FontOption[]> {
  const manifest = await loadFontManifest();
  const options: FontOption[] = [];
  loadErrors.length = 0;

  for (const entry of manifest.fonts) {
    let regularOk = false;
    let boldOk = false;
    try {
      await loadFontFace(entry, entry.regular, "400");
      regularOk = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      loadErrors.push(msg);
      console.warn(msg);
    }
    try {
      await loadFontFace(entry, entry.bold, "700");
      boldOk = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      loadErrors.push(msg);
      console.warn(msg);
    }
    if (regularOk || boldOk) {
      options.push({ value: cssFontFamily(entry), label: entry.label });
    }
  }

  return options;
}

export async function loadBundledTtfBytes(fileName: string): Promise<ArrayBuffer> {
  let pending = ttfBytesCache.get(fileName);
  if (!pending) {
    pending = fetchAndValidateFont(fileName);
    ttfBytesCache.set(fileName, pending);
  }
  return pending;
}

export async function loadBundledFontBytes(
  entry: BundledFontEntry,
  bold: boolean
): Promise<ArrayBuffer> {
  return loadBundledTtfBytes(bold ? entry.bold : entry.regular);
}

/** Strip characters that mis-encode in some PDF viewers. */
export function sanitizePdfExportText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[^\t\n\x20-\x7E]/g, "");
}
