import { useEffect } from "react";
import { ensureViewerFontLoaded, loadBundledFonts } from "../../lib/fonts";
import { cacheKeyFor } from "../../lib/annotationUtils";
import { loadPdfFromCache } from "../../lib/pdfCache";
import { collectMarkFontFamilies } from "../../lib/projectFonts";
import * as commands from "../../commands";
import { useProjectStore } from "../../stores/projectStore";
import { useSessionStore } from "../../stores/sessionStore";
import { PdfViewer } from "./PdfViewer";

export function ScriptPane() {
  const project = useProjectStore((s) => s.project);
  const scriptPdfFile = useSessionStore((s) => s.scriptPdfFile);
  const setScriptPdfFile = useSessionStore((s) => s.setScriptPdfFile);
  const fileName = project.script?.fileName ?? "";

  const cacheHint =
    fileName && !scriptPdfFile ? `PDF not in browser cache. Import "${fileName}" to view the script.` : null;

  const fontKey = collectMarkFontFamilies(project).join("\0");

  useEffect(() => {
    const families = fontKey ? fontKey.split("\0") : [];
    void loadBundledFonts().then(() => Promise.all(families.map((family) => ensureViewerFontLoaded(family))));
  }, [fontKey]);

  useEffect(() => {
    let cancelled = false;
    if (!fileName) {
      setScriptPdfFile(null);
      return;
    }
    if (scriptPdfFile?.name === fileName) return;

    void loadPdfFromCache(cacheKeyFor(project.name, fileName)).then((file) => {
      if (cancelled) return;
      setScriptPdfFile(file);
      if (file && !useProjectStore.getState().project.script?.pages.length) void commands.adoptScript(file);
    });

    return () => {
      cancelled = true;
    };
  }, [project.name, fileName, scriptPdfFile?.name, setScriptPdfFile]);

  return (
    <div className="script-pane">
      {cacheHint && <p className="pdf-cache-hint">{cacheHint}</p>}
      <PdfViewer file={scriptPdfFile} />
    </div>
  );
}
