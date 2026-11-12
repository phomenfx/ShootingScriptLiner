import { useEffect, useRef, useState } from "react";
import { setName } from "../../model/edits";
import { breakUndoGroup, isProjectUnsaved, useProjectStore } from "../../stores/projectStore";

/** The project name, centered in the top bar and editable in place, with the unsaved dot. */
export function ProjectName() {
  const name = useProjectStore((s) => s.project.name);
  const unsaved = useProjectStore(isProjectUnsaved);
  const apply = useProjectStore((s) => s.apply);
  const [draft, setDraft] = useState(name);
  const cancelled = useRef(false);

  useEffect(() => setDraft(name), [name]);

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      setDraft(name);
      return;
    }
    const next = draft.trim() || "Untitled";
    setDraft(next);
    if (next === name) return;
    breakUndoGroup();
    apply(setName(next));
    breakUndoGroup();
  };

  return (
    <div className="topbar-project" title={unsaved ? "Unsaved changes" : undefined}>
      <input
        className="topbar-project-name"
        aria-label="Project name"
        value={draft}
        size={Math.max(8, Math.min(40, draft.length + 1))}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            cancelled.current = true;
            e.currentTarget.blur();
          }
        }}
      />
      {unsaved && <span className="topbar-unsaved" role="img" aria-label="Unsaved changes" />}
    </div>
  );
}
