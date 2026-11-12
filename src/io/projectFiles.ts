/** Reading and building project files: a bare `.json`, or a `.zip` with the JSON, the script PDF and `assets/`. */
import JSZip from "jszip";
import type { Project } from "../model/types";
import { projectFileStem, serializeProject } from "./writeProject";

export type ProjectFileContents = { json: string; pdfFile: File | null };

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
    return { json: await file.text(), pdfFile: null };
  }
  const zip = await JSZip.loadAsync(file);
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
  return { json, pdfFile };
}

export async function buildProjectZip(project: Project, pdfFile: File | null): Promise<Blob> {
  const zip = new JSZip();
  zip.file(`${projectFileStem(project)}.json`, serializeProject(project));
  if (pdfFile) zip.file(project.script?.fileName ?? pdfFile.name, pdfFile);
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
