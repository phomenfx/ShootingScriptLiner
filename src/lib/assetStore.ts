/*
 * Image files for the open project, by asset id. They live in memory while the
 * app runs, are written under `assets/` in the project ZIP, and are also kept
 * in the browser's cache so autosave and JSON-only opens can find them again.
 */
import { create } from "zustand";
import { loadPdfFromCache, savePdfToCache } from "./pdfCache";

type AssetState = { files: Record<string, Blob>; urls: Record<string, string> };

export const useAssetStore = create<AssetState>(() => ({ files: {}, urls: {} }));

const cacheKey = (id: string) => `asset:${id}`;

/** Adds an image file. Also keeps a copy in the browser's cache. */
export function putAsset(id: string, blob: Blob, cache = true): void {
  useAssetStore.setState((s) => ({
    files: { ...s.files, [id]: blob },
    urls: { ...s.urls, [id]: URL.createObjectURL(blob) },
  }));
  if (cache) {
    void savePdfToCache(cacheKey(id), new File([blob], id, { type: blob.type })).catch(() => {
      // The cache is a convenience; the ZIP is the real copy.
    });
  }
}

export function assetBlob(id: string): Blob | undefined {
  return useAssetStore.getState().files[id];
}

/** Forgets every image (a new project, or before opening another). */
export function clearAssets(): void {
  for (const url of Object.values(useAssetStore.getState().urls)) URL.revokeObjectURL(url);
  useAssetStore.setState({ files: {}, urls: {} });
}

/** Fills in images the project lists but memory lacks, from the browser's cache. */
export async function loadMissingAssets(ids: string[]): Promise<string[]> {
  const missing: string[] = [];
  for (const id of ids) {
    if (assetBlob(id)) continue;
    const file = await loadPdfFromCache(cacheKey(id)).catch(() => null);
    if (file) putAsset(id, file, false);
    else missing.push(id);
  }
  return missing;
}

/** Pixel size of an image file. */
export async function imageSize(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

/** File name inside the ZIP for an asset. */
export function assetPath(id: string, type: string): string {
  return `assets/${id}.${type === "image/png" ? "png" : "jpg"}`;
}
