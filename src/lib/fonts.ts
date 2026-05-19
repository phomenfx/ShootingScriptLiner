import {
  cssFontFamily,
  defaultBundledFont,
  loadFontManifest,
  registerBundledFontsForViewer,
  type FontOption,
} from "./bundledFonts";

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

export async function loadBundledFonts(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    fontOptions = await registerBundledFontsForViewer();
  })();
  return loadPromise;
}

export async function getDefaultFontFamily(): Promise<string> {
  const manifest = await loadFontManifest();
  return cssFontFamily(defaultBundledFont(manifest));
}

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
