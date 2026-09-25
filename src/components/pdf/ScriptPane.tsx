import { useEffect } from "react";
import { ensureViewerFontsForProject } from "../../lib/fonts";
import { loadPdfForProject } from "../../lib/pdfCache";
import { collectProjectFontFamilies } from "../../lib/projectFonts";
import { useProjectStore } from "../../stores/projectStore";
import { PdfViewer } from "./PdfViewer";

export function ScriptPane() {
  const project = useProjectStore((s) => s.project);
  const scriptPdfFile = useProjectStore((s) => s.scriptPdfFile);
  const setScriptPdfFile = useProjectStore((s) => s.setScriptPdfFile);

  const cacheHint =
    project.scriptFileName && !scriptPdfFile
      ? `PDF not in browser cache. Import "${project.scriptFileName}" to view the script.`
      : null;

  const fontKey = collectProjectFontFamilies(project).join("\0");

  useEffect(() => {
    void ensureViewerFontsForProject(project);
  }, [fontKey, project]);

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

  return (
    <div className="script-pane">
      {cacheHint && <p className="pdf-cache-hint">{cacheHint}</p>}
      <PdfViewer file={scriptPdfFile} />
      <p className="pdf-hint">
        Use <strong>Save ZIP</strong> or <strong>Open</strong> with a zip for a portable copy (JSON +
        PDF). The PDF is included when it is loaded in the viewer.
      </p>
    </div>
  );
}
