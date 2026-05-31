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

const FONT_CACHE_NAME = "shooting-script-liner-fonts-v1";

let manifestCache: FontManifest | null = null;
const ttfBytesCache = new Map<string, Promise<ArrayBuffer>>();
const loadErrors: string[] = [];
const loadedViewerFamilies = new Set<string>();
const viewerLoadPromises = new Map<string, Promise<void>>();

export function getBundledFontLoadErrors(): readonly string[] {
  return loadErrors;
}

export function fontsBaseUrl(): string {
  const base = import.meta.env.BASE_URL;
  return `${base}fonts/`;
}

function fontFileUrl(fileName: string): string {
  return `${fontsBaseUrl()}${encodeURIComponent(fileName)}`;
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

export function fontOptionsFromManifest(manifest: FontManifest): FontOption[] {
  return manifest.fonts.map((entry) => ({
    value: cssFontFamily(entry),
    label: entry.label,
  }));
}

export async function loadFontManifest(): Promise<FontManifest> {
  if (manifestCache) return manifestCache;
  const res = await fetch(`${fontsBaseUrl()}manifest.json`);
  if (!res.ok) {
    throw new Error("Could not load public/fonts/manifest.json");
  }
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

async function openFontCache(): Promise<Cache | null> {
  if (typeof caches === "undefined") return null;
  try {
    return await caches.open(FONT_CACHE_NAME);
  } catch {
    return null;
  }
}

async function fetchFontBytes(fileName: string): Promise<ArrayBuffer> {
  const url = fontFileUrl(fileName);
  const cache = await openFontCache();
  if (cache) {
    const hit = await cache.match(url);
    if (hit) return hit.arrayBuffer();
  }

  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const buf = await res.arrayBuffer();

  if (cache) {
    try {
      await cache.put(url, new Response(buf.slice(0), { status: 200 }));
    } catch {
      /* ignore quota / private mode */
    }
  }
  return buf;
}

async function fetchAndValidateFont(fileName: string): Promise<ArrayBuffer> {
  const { validateFontBytes, formatFontLoadError } = await import("./fontFileValidation");
  let buf: ArrayBuffer;
  try {
    buf = await fetchFontBytes(fileName);
  } catch {
    throw new Error(
      formatFontLoadError(
        fileName,
        `file not found. Place it in public/fonts/.`
      )
    );
  }
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

async function loadFontFace(
  entry: BundledFontEntry,
  fileName: string,
  weight: "400" | "700"
): Promise<void> {
  const url = fontFileUrl(fileName);
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

async function registerViewerFontEntry(entry: BundledFontEntry): Promise<void> {
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
  if (!regularOk && !boldOk) {
    throw new Error(`Could not load "${entry.family}" for the script viewer.`);
  }
}

/** Load one bundled family into the viewer (cached in memory + Cache API). */
export async function ensureViewerFontLoaded(fontFamily: string): Promise<void> {
  const manifest = await loadFontManifest();
  const entry = findBundledFont(manifest, fontFamily);
  if (!entry) return;

  const key = entry.family.toLowerCase();
  if (loadedViewerFamilies.has(key)) return;

  let pending = viewerLoadPromises.get(key);
  if (!pending) {
    pending = (async () => {
      await registerViewerFontEntry(entry);
      loadedViewerFamilies.add(key);
    })();
    viewerLoadPromises.set(key, pending);
  }
  await pending;
}

/** @deprecated Prefer ensureViewerFontLoaded; loads every manifest family. */
export async function registerBundledFontsForViewer(): Promise<FontOption[]> {
  const manifest = await loadFontManifest();
  loadErrors.length = 0;
  for (const entry of manifest.fonts) {
    await ensureViewerFontLoaded(cssFontFamily(entry));
  }
  return fontOptionsFromManifest(manifest);
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
