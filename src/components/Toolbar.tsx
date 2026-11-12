import { useRef } from "react";
import * as commands from "../commands";
import { useStore } from "zustand";
import { isProjectUnsaved, useProjectStore } from "../stores/projectStore";
import { useSessionStore } from "../stores/sessionStore";

export function Toolbar() {
  const fileRef = useRef<HTMLInputElement>(null);
  const pdfFileRef = useRef<HTMLInputElement>(null);
  const name = useProjectStore((s) => s.project.name);
  const scriptFileName = useProjectStore((s) => s.project.script?.fileName);
  const unsaved = useProjectStore(isProjectUnsaved);
  const canUndo = useStore(useProjectStore.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(useProjectStore.temporal, (s) => s.futureStates.length > 0);
  const setSettingsOpen = useSessionStore((s) => s.setSettingsOpen);

  const projectLabel = scriptFileName ? `${scriptFileName} - ${name}` : name;

  return (
    <header className="toolbar">
      <span className="toolbar-title">Shooting Script Liner</span>
      <span className="toolbar-project" title={unsaved ? `${projectLabel} (unsaved changes)` : projectLabel}>
        {projectLabel}
        {unsaved && (
          <span className="toolbar-unsaved-dot" aria-label="Unsaved changes">
            {" "}
            ●
          </span>
        )}
      </span>
      <div className="toolbar-actions">
        <button type="button" disabled={!canUndo} title="Undo (Ctrl+Z)" onClick={() => commands.undo()}>
          Undo
        </button>
        <button type="button" disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" onClick={() => commands.redo()}>
          Redo
        </button>
        <button type="button" onClick={() => pdfFileRef.current?.click()}>
          Import PDF
        </button>
        <button type="button" onClick={() => commands.newProject()}>
          New
        </button>
        <button type="button" onClick={() => fileRef.current?.click()}>
          Open
        </button>
        <button type="button" onClick={() => void commands.saveZip()}>
          Save ZIP
        </button>
        <button type="button" onClick={() => void commands.exportLinedPdf()}>
          Export lined PDF
        </button>
        <button type="button" onClick={() => void commands.exportShotListCsv()}>
          Export shot list
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
          if (file) void commands.openProject(file);
          e.target.value = "";
        }}
      />
      <input
        ref={pdfFileRef}
        type="file"
        accept=".pdf,application/pdf"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void commands.importPdf(file);
          e.target.value = "";
        }}
      />
    </header>
  );
}
