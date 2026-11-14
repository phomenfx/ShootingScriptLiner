/*
 * Export shot list PDF: columns, paper, scale and which shots. The choices are
 * remembered for next time.
 */
import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import * as commands from "../commands";
import { choiceEntries } from "../model/registry";
import { PAPERS, type PaperId, type ShotListPdfOptions } from "../model/shotListPdf";
import { usePrefsStore } from "../stores/prefsStore";
import { useProjectStore } from "../stores/projectStore";
import { useSessionStore } from "../stores/sessionStore";

const FONTS = ["Arial", "Calibri", "Georgia", "Courier New", "Consolas"];

export function ShotListPdfDialog() {
  const open = useSessionStore((s) => s.shotListPdfOpen);
  const setOpen = useSessionStore((s) => s.setShotListPdfOpen);
  const project = useProjectStore((s) => s.project);
  usePrefsStore((s) => s.shotListPdf);
  useSessionStore((s) => s.exportChoices);
  const options = commands.shotListPdfOptions();
  const set = (patch: Partial<ShotListPdfOptions>) => commands.setExportChoices({ shotListPdf: { ...options, ...patch } });
  const order = usePrefsStore((s) => s.tableColumnOrder);
  const hidden = usePrefsStore((s) => s.hiddenTableColumns);
  const widths = usePrefsStore((s) => s.tableColumnWidths);
  const lists = project.settings.lists;

  const all = commands.shotListPdfColumnChoices();
  const chosen = commands.shotListPdfColumns(options).map((c) => c.id);
  const toggleColumn = (id: string, on: boolean) => {
    const next = on ? [...chosen, id] : chosen.filter((c) => c !== id);
    set({ columns: all.map((c) => c.id).filter((c) => c === "shot" || next.includes(c)) });
  };
  const toggle = (list: string[], key: string, on: boolean) => (on ? list.filter((k) => k !== key) : [...new Set([...list, key])]);

  // Page count and columns that don't fit, with the export's own fonts.
  const [summary, setSummary] = useState<{ pages: number; dropped: string[]; scale: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    const t = window.setTimeout(() => {
      void commands.shotListPdfSummary(options).then((s) => live && setSummary(s));
    }, 150);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [open, options, project, order, hidden, widths]);

  const sceneLabel = (i: number) => {
    const h = project.scenes[i]!.heading;
    return `${i + 1}. ${[h.indicator, h.location].filter(Boolean).join(" ") || "Scene"}${h.time ? ` - ${h.time}` : ""}`;
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-card import-dialog pdf-export-dialog" aria-describedby={undefined}>
          <Dialog.Title className="import-title">Export shot list PDF</Dialog.Title>
          <div className="import-body">
            <section className="export-group">
              <h3>Columns</h3>
              <div className="export-checks">
                <button type="button" className="dialog-btn export-small-btn" onClick={() => set({ columns: null })} disabled={options.columns === null}>
                  Same as the table
                </button>
              </div>
              <div className="export-checks export-columns">
                {all.map((c) => (
                  <label key={c.id}>
                    <input type="checkbox" checked={chosen.includes(c.id)} disabled={c.id === "shot"} onChange={(ev) => toggleColumn(c.id, ev.target.checked)} />
                    {c.label}
                  </label>
                ))}
              </div>
              <p className="export-note">Columns print in the table's order and widths. Drag headers in the table to change them.</p>
              <div className="export-checks">
                <label>
                  <input type="checkbox" checked={options.checkbox} onChange={(ev) => set({ checkbox: ev.target.checked })} />
                  Tick box for each shot
                </label>
                <label>
                  <input type="checkbox" checked={options.colorDot} onChange={(ev) => set({ colorDot: ev.target.checked })} />
                  Shot color
                </label>
                <label>
                  <input type="checkbox" checked={options.wrap} onChange={(ev) => set({ wrap: ev.target.checked })} />
                  Wrap long text
                </label>
              </div>
            </section>

            <section className="export-group">
              <h3>Page</h3>
              <div className="export-checks">
                <span className="export-label">Paper</span>
                <select value={options.paper} onChange={(ev) => set({ paper: ev.target.value as PaperId })}>
                  {PAPERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <label>
                  <input type="radio" checked={options.landscape} onChange={() => set({ landscape: true })} />
                  Landscape
                </label>
                <label>
                  <input type="radio" checked={!options.landscape} onChange={() => set({ landscape: false })} />
                  Portrait
                </label>
              </div>
              <div className="export-checks">
                <span className="export-label">Scale</span>
                <label>
                  <input type="radio" checked={options.fit} onChange={() => set({ fit: true })} />
                  Fit to page width
                </label>
                <label>
                  <input type="radio" checked={!options.fit} onChange={() => set({ fit: false })} />
                  <input
                    type="number"
                    className="export-range export-num"
                    min={25}
                    max={300}
                    step={5}
                    value={options.scalePct}
                    onFocus={() => set({ fit: false })}
                    onChange={(ev) => {
                      const v = Number(ev.target.value);
                      if (Number.isFinite(v) && v > 0) set({ fit: false, scalePct: Math.min(300, Math.max(25, v)) });
                    }}
                  />
                  %
                </label>
              </div>
              <div className="export-checks">
                <span className="export-label">Text</span>
                <select value={options.font} onChange={(ev) => set({ font: ev.target.value })} aria-label="Font">
                  {FONTS.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
                <label>
                  <input
                    type="number"
                    className="export-range export-num"
                    min={5}
                    max={24}
                    step={0.5}
                    value={options.fontSizePt}
                    onChange={(ev) => {
                      const v = Number(ev.target.value);
                      if (Number.isFinite(v) && v > 0) set({ fontSizePt: Math.min(24, Math.max(5, v)) });
                    }}
                  />
                  pt at 100%
                </label>
              </div>
              <div className="export-checks">
                <span className="export-label">Group</span>
                <label>
                  <input type="radio" checked={options.groupBy === "scene"} onChange={() => set({ groupBy: "scene" })} />
                  By scene
                </label>
                <label>
                  <input type="radio" checked={options.groupBy === "date"} onChange={() => set({ groupBy: "date" })} />
                  By scheduled date
                </label>
                <label>
                  <input type="checkbox" checked={options.newPagePerGroup} onChange={(ev) => set({ newPagePerGroup: ev.target.checked })} />
                  {options.groupBy === "date" ? "New page for each day" : "New page for each scene"}
                </label>
              </div>
              <div className="export-checks">
                <label>
                  <input type="checkbox" checked={options.titles} onChange={(ev) => set({ titles: ev.target.checked })} />
                  Title, date and page numbers
                </label>
              </div>
            </section>

            <section className="export-group">
              <h3>Shots</h3>
              <div className="export-checks">
                <span className="export-label">Status</span>
                {choiceEntries("status", lists).map((e) => (
                  <label key={e.key}>
                    <input type="checkbox" checked={!options.skipStatus.includes(e.key)} onChange={(ev) => set({ skipStatus: toggle(options.skipStatus, e.key, ev.target.checked) })} />
                    {e.label}
                  </label>
                ))}
              </div>
              <div className="export-checks">
                <span className="export-label">Priority</span>
                {choiceEntries("priority", lists).map((e) => (
                  <label key={e.key}>
                    <input type="checkbox" checked={!options.skipPriority.includes(e.key)} onChange={(ev) => set({ skipPriority: toggle(options.skipPriority, e.key, ev.target.checked) })} />
                    {e.label}
                  </label>
                ))}
              </div>
              <div className="export-checks export-scenes">
                <span className="export-label">Scenes</span>
                <label>
                  <input type="checkbox" checked={options.sceneIds === null} onChange={(ev) => set({ sceneIds: ev.target.checked ? null : project.scenes.map((s) => s.id) })} />
                  All scenes
                </label>
                {options.sceneIds !== null &&
                  project.scenes.map((scene, i) => (
                    <label key={scene.id}>
                      <input
                        type="checkbox"
                        checked={options.sceneIds!.includes(scene.id)}
                        onChange={(ev) => set({ sceneIds: ev.target.checked ? [...options.sceneIds!, scene.id] : options.sceneIds!.filter((id) => id !== scene.id) })}
                      />
                      {sceneLabel(i)}
                    </label>
                  ))}
              </div>
              <div className="export-checks">
                <label>
                  <input type="checkbox" checked={options.includeHidden} onChange={(ev) => set({ includeHidden: ev.target.checked })} />
                  Include shots hidden on the script
                </label>
              </div>
            </section>

            <p className="import-summary">
              {summary
                ? `${summary.pages} ${summary.pages === 1 ? "page" : "pages"} at ${Math.round(summary.scale * 100)}%.`
                : "Working out the pages…"}
              {summary && summary.dropped.length > 0 && (
                <span className="export-warning">
                  {" "}
                  Too wide for the page, left out: {summary.dropped.join(", ")}. Lower the scale, use landscape or larger paper, or choose Fit to page width.
                </span>
              )}
            </p>
          </div>
          <div className="dialog-buttons">
            <button type="button" className="dialog-btn dialog-btn-left" title="New projects start with these choices. They are also saved with this project." onClick={() => commands.saveExportDefaults("shotListPdf")}>
              Save as my defaults
            </button>
            <button type="button" className="dialog-btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="dialog-btn dialog-btn-primary"
              autoFocus
              onClick={() => {
                setOpen(false);
                void commands.exportShotListPdf();
              }}
            >
              Export
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
