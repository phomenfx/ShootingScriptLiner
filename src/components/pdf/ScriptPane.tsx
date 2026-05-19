import { useEffect, useRef } from "react";
import { cachePdfForProject, loadPdfForProject } from "../../lib/pdfCache";
import { useProjectStore } from "../../stores/projectStore";
import { PdfViewer } from "./PdfViewer";

export function ScriptPane() {
  const fileRef = useRef<HTMLInputElement>(null);
  const project = useProjectStore((s) => s.project);
  const scriptPdfFile = useProjectStore((s) => s.scriptPdfFile);
  const setScriptPdfFile = useProjectStore((s) => s.setScriptPdfFile);
  const setScriptFileName = useProjectStore((s) => s.setScriptFileName);

  const cacheHint =
    project.scriptFileName && !scriptPdfFile
      ? `PDF not in browser cache. Import "${project.scriptFileName}" to view the script.`
      : null;

  useEffect(() => {
    let cancelled = false;
    if (!project.scriptFileName) {
      setScriptPdfFile(null);
      return;
    }

    if (scriptPdfFile?.name === project.scriptFileName) return;

    void loadPdfForProject(project).then((file) => {
      if (cancelled) return;
      setScriptPdfFile(file);
    });

    return () => {
      cancelled = true;
    };
  }, [project.name, project.scriptFileName, scriptPdfFile?.name, setScriptPdfFile]);

  const handleImport = async (file: File) => {
    setScriptPdfFile(file);
    setScriptFileName(file.name);
    const proj = useProjectStore.getState().project;
    await cachePdfForProject({ ...proj, scriptFileName: file.name }, file);
  };

  return (
    <div className="script-pane">
      <div className="script-pane-bar">
        <button type="button" onClick={() => fileRef.current?.click()}>
          Import PDF
        </button>
        {project.scriptFileName && (
          <span className="script-filename">{project.scriptFileName}</span>
        )}
      </div>
      {cacheHint && <p className="pdf-cache-hint">{cacheHint}</p>}
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,application/pdf"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleImport(file);
          e.target.value = "";
        }}
      />
      <PdfViewer file={scriptPdfFile} />
      <p className="pdf-hint">
        Use <strong>Save ZIP</strong> or <strong>Open</strong> with a zip for a portable copy (JSON +
        PDF). The PDF is included when it is loaded in the viewer.
      </p>
    </div>
  );
}
