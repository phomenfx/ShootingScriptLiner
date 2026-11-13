/*
 * The pattern list, each row with a short sample of the stroke. "Custom
 * dashes" makes a dash pattern from a typed sequence; custom patterns already
 * used in the project are offered on every line.
 */
import { useMemo, useState } from "react";
import { choiceLabel } from "../../model/registry";
import { customDashKey, customDashLabel, parseDashKey, patternKeys, segmentStrands } from "../../lib/strokeGeometry";
import { useProjectStore } from "../../stores/projectStore";
import type { Project } from "../../model/types";

/** Custom dash patterns anywhere in the project: lines, their segments, shapes and the defaults. */
function customPatterns(project: Project): string[] {
  const found = new Set<string>();
  const add = (key: string | undefined) => key && customDashLabel(key) && found.add(key);
  for (const mark of project.marks) {
    if (mark.kind === "line") {
      add(mark.stroke.pattern);
      for (const seg of mark.segments ?? []) add(seg?.pattern);
    } else if (mark.kind === "shape") add(mark.stroke?.pattern);
  }
  add(project.settings.markDefaults.line.stroke.pattern);
  add(project.settings.markDefaults.shape.stroke?.pattern);
  return [...found];
}

const label = (key: string) => customDashLabel(key) ?? choiceLabel("pattern", key);

export function PatternPicker({ value, onChange }: { value: string; onChange: (pattern: string) => void }) {
  const project = useProjectStore((s) => s.project);
  const custom = useMemo(() => customPatterns(project), [project]);
  const [editing, setEditing] = useState(false);
  const current = parseDashKey(value);
  const [draft, setDraft] = useState(current ? current.join(" ") : "8 3 2 3");
  const draftKey = customDashKey(draft);
  return (
    <div className="pf-patterns" role="listbox" aria-label="Pattern">
      {patternKeys(value, custom).map((key) => (
        <button key={key} type="button" role="option" className="pf-pattern" aria-selected={key === value} onClick={() => onChange(key)}>
          <PatternSwatch pattern={key} />
          <span>{label(key)}</span>
        </button>
      ))}
      {!editing ? (
        <button type="button" className="pf-pattern pf-pattern-custom" onClick={() => setEditing(true)}>
          <span className="pf-pattern-swatch" />
          <span>Custom dashes…</span>
        </button>
      ) : (
        <div className="pf-pattern-editor">
          <label>
            Dash, gap, dash, gap… (in line widths)
            <input
              className="pf-input"
              value={draft}
              aria-label="Custom dash sequence"
              placeholder="8 3 2 3"
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && draftKey) {
                  onChange(draftKey);
                  setEditing(false);
                } else if (e.key === "Escape") setEditing(false);
              }}
            />
          </label>
          <div className="pf-pattern-editor-row">
            {draftKey ? <PatternSwatch pattern={draftKey} /> : <span className="pf-none">Up to 8 numbers, like 8 3 2 3</span>}
            <button type="button" className="pf-btn pf-btn-small" disabled={!draftKey} onClick={() => draftKey && (onChange(draftKey), setEditing(false))}>
              Use
            </button>
            <button type="button" className="pf-btn pf-btn-small" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PatternSwatch({ pattern }: { pattern: string }) {
  const strands = segmentStrands({ x: 2, y: 8 }, { x: 54, y: 8 }, pattern, 1.25, { patternSizePct: 80 });
  return (
    <svg className="pf-pattern-swatch" viewBox="0 0 56 16" aria-hidden="true">
      {strands.map((strand, index) => (
        <polyline
          key={index}
          points={strand.points.map((point) => `${point.x},${point.y}`).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth={Math.max(1, strand.widthPt)}
          strokeDasharray={strand.dash?.join(" ")}
          strokeOpacity={strand.opacity}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}
