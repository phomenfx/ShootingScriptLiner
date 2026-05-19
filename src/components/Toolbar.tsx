import { useRef } from "react";
import { downloadLinedPdf, downloadProjectZip, openProjectFile } from "../lib/projectIO";
import { cachePdfForProject } from "../lib/pdfCache";
import { useProjectStore } from "../stores/projectStore";

export function Toolbar() {
  const fileRef = useRef<HTMLInputElement>(null);
  const project = useProjectStore((s) => s.project);
  const newProject = useProjectStore((s) => s.newProject);
  const loadProject = useProjectStore((s) => s.loadProject);
  const setScriptFileName = useProjectStore((s) => s.setScriptFileName);
  const setScriptPdfFile = useProjectStore((s) => s.setScriptPdfFile);
  const setSettingsOpen = useProjectStore((s) => s.setSettingsOpen);

  const handleOpen = async (file: File) => {
    try {
      const { project: loaded, pdfFile } = await openProjectFile(file);
      loadProject(loaded);
      setScriptPdfFile(pdfFile);
      if (pdfFile) {
        const name = loaded.scriptFileName ?? pdfFile.name;
        await cachePdfForProject(
          { ...useProjectStore.getState().project, scriptFileName: name },
          pdfFile
        );
        if (useProjectStore.getState().project.scriptFileName !== name) {
          setScriptFileName(name);
        }
      }
    } catch {
      alert("Could not open project file. Use a .json file or a .zip from Save ZIP.");
    }
  };

  return (
    <header className="toolbar">
      <span className="toolbar-title">Shooting Script Liner</span>
      <span className="toolbar-project">{project.name}</span>
      <div className="toolbar-actions">
        <button type="button" onClick={() => newProject()}>
          New
        </button>
        <button type="button" onClick={() => fileRef.current?.click()}>
          Open
        </button>
        <button
          type="button"
          onClick={() => void downloadProjectZip(project).catch(() => alert("Could not build zip."))}
        >
          Save ZIP
        </button>
        <button
          type="button"
          onClick={() =>
            void downloadLinedPdf(project).catch((err) =>
              alert(
                err instanceof Error && err.message.includes("font")
                  ? err.message
                  : "Could not export PDF. Check that TTF files are in public/fonts/ (see README)."
              )
            )
          }
        >
          Export lined PDF
        </button>
        <button type="button" onClick={() => setSettingsOpen(true)}>
          Settings
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".json,.zip,application/json,application/zip"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleOpen(file);
          e.target.value = "";
        }}
      />
    </header>
  );
}
