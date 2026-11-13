/*
 * Import shot list: a CSV or tab-separated file, or cells pasted from a
 * spreadsheet. Columns match by header; a summary shows before anything
 * changes, and the import is one undo step.
 */
import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useState } from "react";
import { guessMapping, IMPORT_FIELDS, parseTable, planImport, rememberMapping, type ImportField, type ImportMode } from "../model/shotImport";
import { breakUndoGroup, useProjectStore } from "../stores/projectStore";
import { useSessionStore } from "../stores/sessionStore";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function ImportDialog() {
  const open = useSessionStore((s) => s.importOpen);
  const setOpen = useSessionStore((s) => s.setImportOpen);
  const pending = useSessionStore((s) => s.importText);
  const project = useProjectStore((s) => s.project);
  const [text, setText] = useState("");
  const [mapping, setMapping] = useState<ImportField[]>([]);
  const [mode, setMode] = useState<ImportMode>("update");
  const [source, setSource] = useState("");

  // A file dropped on the table arrives as text.
  useEffect(() => {
    if (open && pending !== null) {
      load(pending.text, pending.name);
      useSessionStore.getState().setImportText(null);
    }
  }, [open, pending]);

  function load(next: string, name: string) {
    setText(next);
    setSource(name);
    const header = parseTable(next)[0] ?? [];
    setMapping(guessMapping(header, useProjectStore.getState().project.settings.importMapping));
  }

  const rows = useMemo(() => parseTable(text), [text]);
  const header = rows[0] ?? [];
  const plan = useMemo(
    () => (rows.length > 1 ? planImport(project, rows, mapping.length === header.length ? mapping : guessMapping(header, project.settings.importMapping), mode) : null),
    [project, rows, mapping, mode, header]
  );

  const close = () => {
    setOpen(false);
    setText("");
    setMapping([]);
    setSource("");
  };

  const chooseFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void file.text().then((t) => load(t, file.name));
    };
    input.click();
  };

  const apply = () => {
    if (!plan) return;
    const used = mapping.length === header.length ? mapping : guessMapping(header, project.settings.importMapping);
    breakUndoGroup();
    // The column choices are remembered with the project for the next import.
    useProjectStore.getState().apply((current) => {
      const next = planImport(current, rows, used, mode).project;
      return { ...next, settings: { ...next.settings, importMapping: rememberMapping(current.settings.importMapping, header, used) } };
    });
    breakUndoGroup();
    close();
  };

  const sample = rows[1] ?? [];
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-card import-dialog" aria-describedby={undefined}>
          <Dialog.Title className="import-title">Import shot list</Dialog.Title>
          <div className="import-body">
            <div className="import-source">
              <button type="button" className="dialog-btn" onClick={chooseFile}>
                Choose CSV file…
              </button>
              <span className="import-or">or paste cells from Excel or Google Sheets:</span>
              <textarea
                className="import-paste"
                placeholder="Paste here (the first row must be the column names)"
                value={source ? "" : text}
                onChange={(e) => load(e.target.value, "")}
                rows={3}
              />
              {source && <p className="import-file">Reading {source}</p>}
            </div>

            {header.length > 0 && (
              <>
                <table className="import-map">
                  <thead>
                    <tr>
                      <th>Column</th>
                      <th>First row</th>
                      <th>Goes to</th>
                    </tr>
                  </thead>
                  <tbody>
                    {header.map((name, i) => (
                      <tr key={i} className={mapping[i] === "skip" ? "is-skipped" : undefined}>
                        <td>{name || <em>(no name)</em>}</td>
                        <td className="import-sample">{sample[i] ?? ""}</td>
                        <td>
                          <select
                            value={mapping[i] ?? "skip"}
                            onChange={(e) => setMapping(header.map((_, j) => (j === i ? (e.target.value as ImportField) : (mapping[j] ?? "skip"))))}
                          >
                            {IMPORT_FIELDS.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <fieldset className="import-mode">
                  <label>
                    <input type="radio" checked={mode === "update"} onChange={() => setMode("update")} /> Update shots with the same scene and shot ID, add the rest
                  </label>
                  <label>
                    <input type="radio" checked={mode === "add"} onChange={() => setMode("add")} /> Add every row as a new shot
                  </label>
                </fieldset>

                {plan && (
                  <p className="import-summary">
                    {plural(rows.length - 1, "row")}: {plural(plan.newScenes, "new scene")}, {plural(plan.updatedShots, "updated shot")},{" "}
                    {plural(plan.newShots, "new shot")}.
                    {plan.skippedColumns.length > 0 && <> Not imported: {plan.skippedColumns.join(", ")}.</>} Nothing is deleted, and lines on the
                    script stay as they are. Undo takes it all back.
                  </p>
                )}
              </>
            )}
          </div>
          <div className="dialog-buttons">
            <button type="button" className="dialog-btn" onClick={close}>
              Cancel
            </button>
            <button type="button" className="dialog-btn dialog-btn-primary" disabled={!plan} onClick={apply}>
              Import
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
