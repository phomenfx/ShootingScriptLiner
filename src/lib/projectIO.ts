import JSZip from "jszip";
import type { Project } from "../types/project";
import { cachePdfForProject, loadPdfForProject } from "./pdfCache";
import { buildLinedPdfBytes } from "./pdfExport";
import { parseProject, serializeProject } from "./labelUtils";
import { useProjectStore } from "../stores/projectStore";

async function resolveScriptPdfForExport(project: Project): Promise<File | null> {
  const fromStore = useProjectStore.getState().scriptPdfFile;
  if (fromStore) return fromStore;
  return loadPdfForProject(project);
}

export type OpenProjectResult = {
  project: Project;
  pdfFile: File | null;
};

function basename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] ?? path;
}

/** Open a `.json` project or a `.zip` archive (JSON + optional PDF). */
export async function openProjectFile(file: File): Promise<OpenProjectResult> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".zip")) {
    const zip = await JSZip.loadAsync(file);
    const entries = Object.values(zip.files).filter((e) => !e.dir);

    const jsonEntry = entries.find((e) => e.name.toLowerCase().endsWith(".json"));
    if (!jsonEntry) {
      throw new Error("ZIP has no .json project file");
    }

    const project = parseProject(await jsonEntry.async("string"));
    const pdfEntry = entries.find((e) => e.name.toLowerCase().endsWith(".pdf"));

    let pdfFile: File | null = null;
    if (pdfEntry) {
      const buf = await pdfEntry.async("arraybuffer");
      const pdfName = basename(pdfEntry.name);
      pdfFile = new File([buf], pdfName, { type: "application/pdf" });
    }

    const scriptFileName = project.scriptFileName ?? pdfFile?.name;
    return {
      project: scriptFileName ? { ...project, scriptFileName } : project,
      pdfFile,
    };
  }

  return { project: await readProjectJsonFile(file), pdfFile: null };
}

export async function downloadProjectZip(project: Project): Promise<void> {
  const zip = new JSZip();
  const safeName = project.name.replace(/[^\w.-]+/g, "_") || "project";
  zip.file(`${safeName}.json`, serializeProject(project));
  const pdfFile = await resolveScriptPdfForExport(project);
  if (pdfFile) {
    const pdfName = project.scriptFileName ?? pdfFile.name;
    zip.file(pdfName, pdfFile);
    await cachePdfForProject({ ...project, scriptFileName: pdfName }, pdfFile);
  } else if (project.scriptFileName) {
    window.alert(
      `Could not find "${project.scriptFileName}" in this browser. Use Import PDF on the script, then Save ZIP again.`
    );
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadLinedPdf(project: Project): Promise<void> {
  const pdfFile = await resolveScriptPdfForExport(project);
  if (!pdfFile) {
    window.alert("Import the PDF first so it is cached in this browser, then export again.");
    return;
  }
  const bytes = await buildLinedPdfBytes(project, await pdfFile.arrayBuffer());
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const safeName = project.name.replace(/[^\w.-]+/g, "_") || "project";
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName}-lined.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export function readProjectJsonFile(file: File): Promise<Project> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(parseProject(reader.result as string));
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/** @deprecated Use openProjectFile */
export function readProjectFile(file: File): Promise<Project> {
  return readProjectJsonFile(file);
}
