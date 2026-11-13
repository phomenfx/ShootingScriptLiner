/*
 * Export lined PDF: which shots, marks and pages go in. The choices last for
 * this session, so Export again repeats them.
 */
import * as Dialog from "@radix-ui/react-dialog";
import * as commands from "../commands";
import { choiceEntries } from "../model/registry";
import { markPrints, pagesToKeep, type PdfExportOptions } from "../model/pdfOptions";
import { useProjectStore } from "../stores/projectStore";
import { useSessionStore } from "../stores/sessionStore";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function PdfExportDialog() {
  const open = useSessionStore((s) => s.pdfExportOpen);
  const setOpen = useSessionStore((s) => s.setPdfExportOpen);
  const options = useSessionStore((s) => s.pdfOptions);
  const setOptions = (patch: Partial<PdfExportOptions>) => useSessionStore.getState().setPdfOptions({ ...options, ...patch });
  const project = useProjectStore((s) => s.project);
  const lists = project.settings.lists;

  const toggle = (list: string[], key: string, on: boolean) => (on ? list.filter((k) => k !== key) : [...new Set([...list, key])]);
  const shown = (mark: (typeof project.marks)[number]) => {
    if (mark.kind === "image" || !mark.shotId) return true;
    for (const scene of project.scenes) {
      const shot = scene.shots.find((s) => s.id === mark.shotId);
      if (shot) return shot.visible && scene.visible;
    }
    return true;
  };
  const printed = project.marks.filter((m) => shown(m) && markPrints(project, m, options));
  const pageCount = project.script?.pageCount ?? 0;
  const pages = pageCount ? pagesToKeep(project, options, pageCount, shown) : [];
  const count = (kind: string) => printed.filter((m) => m.kind === kind).length;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-card import-dialog pdf-export-dialog" aria-describedby={undefined}>
          <Dialog.Title className="import-title">Export lined PDF</Dialog.Title>
          <div className="import-body">
            <section className="export-group">
              <h3>Shots</h3>
              <div className="export-checks">
                <span className="export-label">Status</span>
                {choiceEntries("status", lists).map((e) => (
                  <label key={e.key}>
                    <input
                      type="checkbox"
                      checked={!options.skipStatus.includes(e.key)}
                      onChange={(ev) => setOptions({ skipStatus: toggle(options.skipStatus, e.key, ev.target.checked) })}
                    />
                    {e.label}
                  </label>
                ))}
              </div>
              <div className="export-checks">
                <span className="export-label">Priority</span>
                {choiceEntries("priority", lists).map((e) => (
                  <label key={e.key}>
                    <input
                      type="checkbox"
                      checked={!options.skipPriority.includes(e.key)}
                      onChange={(ev) => setOptions({ skipPriority: toggle(options.skipPriority, e.key, ev.target.checked) })}
                    />
                    {e.label}
                  </label>
                ))}
              </div>
              <div className="export-checks export-scenes">
                <span className="export-label">Scenes</span>
                <label>
                  <input type="checkbox" checked={options.sceneIds === null} onChange={(ev) => setOptions({ sceneIds: ev.target.checked ? null : project.scenes.map((s) => s.id) })} />
                  All scenes
                </label>
                {options.sceneIds !== null &&
                  project.scenes.map((scene, i) => (
                    <label key={scene.id}>
                      <input
                        type="checkbox"
                        checked={options.sceneIds!.includes(scene.id)}
                        onChange={(ev) =>
                          setOptions({ sceneIds: ev.target.checked ? [...options.sceneIds!, scene.id] : options.sceneIds!.filter((id) => id !== scene.id) })
                        }
                      />
                      {i + 1}. {[scene.heading.indicator, scene.heading.location].filter(Boolean).join(" ") || "Scene"}
                      {scene.heading.time ? ` - ${scene.heading.time}` : ""}
                    </label>
                  ))}
              </div>
              <p className="export-note">Hidden shots and scenes (their eye is off) never print.</p>
            </section>

            <section className="export-group">
              <h3>Marks</h3>
              <div className="export-checks">
                {(
                  [
                    ["lines", "Lines"],
                    ["captions", "Captions"],
                    ["notes", "Notes"],
                    ["shapes", "Shapes and images"],
                    ["unlinked", "Marks not linked to a shot"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={options.include[key]}
                      onChange={(ev) => setOptions({ include: { ...options.include, [key]: ev.target.checked } })}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </section>

            <section className="export-group">
              <h3>Pages</h3>
              <div className="export-checks">
                <label>
                  <input type="radio" checked={options.pages === "all"} onChange={() => setOptions({ pages: "all" })} />
                  All pages
                </label>
                <label>
                  <input type="radio" checked={options.pages === "marked"} onChange={() => setOptions({ pages: "marked" })} />
                  Only pages with marks
                </label>
                <label>
                  <input type="radio" checked={options.pages === "range"} onChange={() => setOptions({ pages: "range" })} />
                  Pages
                  <input
                    type="text"
                    className="export-range"
                    placeholder="2-5, 8"
                    value={options.range}
                    onFocus={() => setOptions({ pages: "range" })}
                    onChange={(ev) => setOptions({ pages: "range", range: ev.target.value })}
                  />
                </label>
              </div>
            </section>

            <p className="import-summary">
              {plural(count("line"), "line")}, {plural(count("text"), "note")}, {plural(count("shape"), "shape")} on {plural(pages.length, "page")}.
            </p>
          </div>
          <div className="dialog-buttons">
            <button type="button" className="dialog-btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="dialog-btn dialog-btn-primary"
              autoFocus
              disabled={pages.length === 0}
              onClick={() => {
                setOpen(false);
                void commands.exportLinedPdf();
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
