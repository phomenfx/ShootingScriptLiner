import { choiceLabel } from "../../model/registry";
import { patternKeys, segmentStrands } from "../../lib/strokeGeometry";

/** The pattern list, each row with a short sample of the stroke. */
export function PatternPicker({ value, onChange }: { value: string; onChange: (pattern: string) => void }) {
  return (
    <div className="pf-patterns" role="listbox" aria-label="Pattern">
      {patternKeys(value).map((key) => (
        <button key={key} type="button" role="option" className="pf-pattern" aria-selected={key === value} onClick={() => onChange(key)}>
          <PatternSwatch pattern={key} />
          <span>{choiceLabel("pattern", key)}</span>
        </button>
      ))}
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
