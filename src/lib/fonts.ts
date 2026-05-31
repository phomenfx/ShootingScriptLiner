import {
  cssFontFamily,
  defaultBundledFont,
  ensureViewerFontLoaded,
  fontOptionsFromManifest,
  loadFontManifest,
  type FontOption,
} from "./bundledFonts";
import { collectProjectFontFamilies } from "./projectFonts";
import type { Project } from "../types/project";

export {
  getBundledFontLoadErrors,
  parseFontFamilies,
  sanitizePdfExportText,
} from "./bundledFonts";

let fontOptions: FontOption[] = [];
let loadPromise: Promise<void> | null = null;

export function getFontOptions(): FontOption[] {
  return fontOptions;
}

/** Load manifest + dropdown options; preload default font only. */
export async function loadBundledFonts(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const manifest = await loadFontManifest();
    fontOptions = fontOptionsFromManifest(manifest);
    await ensureViewerFontLoaded(cssFontFamily(defaultBundledFont(manifest)));
  })();
  return loadPromise;
}

export async function ensureViewerFontsForProject(project: Project): Promise<void> {
  await loadBundledFonts();
  const families = collectProjectFontFamilies(project);
  await Promise.all(families.map((f) => ensureViewerFontLoaded(f)));
}

export async function getDefaultFontFamily(): Promise<string> {
  const manifest = await loadFontManifest();
  return cssFontFamily(defaultBundledFont(manifest));
}

export { ensureViewerFontLoaded } from "./bundledFonts";

export const SHOT_LINK_MIME = "application/x-ssl-shot";

export type ShotLinkPayload = { sceneId: string; shotId: string };

export function parseShotLinkPayload(raw: string): ShotLinkPayload | null {
  try {
    const data = JSON.parse(raw) as ShotLinkPayload;
    if (data.sceneId && data.shotId) return data;
  } catch {
    /* ignore */
  }
  return null;
}
