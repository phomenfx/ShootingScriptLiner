/** Reading and building project files: a bare `.json`, or a `.zip` with the JSON, the script PDF and `assets/`. */
import JSZip from "jszip";
import type { Project } from "../model/types";
import { assetPath } from "../lib/assetStore";
import { projectFileStem, serializeProject } from "./writeProject";

export type ProjectFileContents = {
  json: string;
  pdfFile: File | null;
  /** Image files from `assets/`, by asset id (the file name without its extension). */
  assets: Record<string, Blob>;
};

function basename(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() ?? path;
}

/** The script file name a project JSON asks for, in either format version. */
export function scriptNameInJson(json: string): string | undefined {
  try {
    const raw = JSON.parse(json) as { script?: { fileName?: unknown }; scriptFileName?: unknown };
    const name = raw.script?.fileName ?? raw.scriptFileName;
    return typeof name === "string" && name ? name : undefined;
  } catch {
    return undefined;
  }
}

export async function readProjectFile(file: File): Promise<ProjectFileContents> {
  if (!file.name.toLowerCase().endsWith(".zip")) {
    return { json: await file.text(), pdfFile: null, assets: {} };
  }
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entries = Object.values(zip.files).filter((e) => !e.dir && !e.name.startsWith("assets/"));
  const jsonEntry = entries.find((e) => e.name.toLowerCase().endsWith(".json"));
  if (!jsonEntry) throw new Error("This ZIP has no project file in it.");
  const json = await jsonEntry.async("string");

  // The script is found by the name the project gives, not by taking the first PDF.
  const wanted = scriptNameInJson(json);
  const pdfs = entries.filter((e) => e.name.toLowerCase().endsWith(".pdf"));
  const pdfEntry = pdfs.find((e) => basename(e.name) === wanted) ?? pdfs[0];
  const pdfFile = pdfEntry
    ? new File([await pdfEntry.async("arraybuffer")], basename(pdfEntry.name), { type: "application/pdf" })
    : null;
  const assets: Record<string, Blob> = {};
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || !entry.name.startsWith("assets/")) continue;
    const name = basename(entry.name);
    const id = name.replace(/\.[^.]+$/, "");
    const type = /\.png$/i.test(name) ? "image/png" : "image/jpeg";
    assets[id] = new Blob([await entry.async("arraybuffer")], { type });
  }
  return { json, pdfFile, assets };
}

export async function buildProjectZip(
  project: Project,
  pdfFile: File | null,
  assetFiles: (id: string) => Blob | undefined = () => undefined
): Promise<Blob> {
  const zip = new JSZip();
  // Only images some mark still uses are kept.
  const used = new Set(project.marks.flatMap((mark) => (mark.kind === "image" ? [mark.assetId] : [])));
  const assets = project.assets.filter((asset) => used.has(asset.id) && assetFiles(asset.id));
  zip.file(`${projectFileStem(project)}.json`, serializeProject({ ...project, assets }));
  if (pdfFile) zip.file(project.script?.fileName ?? pdfFile.name, pdfFile);
  for (const asset of assets) zip.file(assetPath(asset.id, asset.type), await assetFiles(asset.id)!.arrayBuffer());
  return zip.generateAsync({ type: "blob" });
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
