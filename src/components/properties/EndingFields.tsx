import { CAP_OPTIONS } from "../../lib/lineCaps";
import type { LineEnding, LineStyle } from "../../types/annotations";
import { capSupportsFill } from "../../types/annotations";

type Props = {
  label: string;
  ending: LineEnding;
  onChange: (end: LineEnding) => void;
};

export function EndingFields({ label, ending, onChange }: Props) {
  const showFill = capSupportsFill(ending.cap);

  return (
    <div className="ending-block">
      <div className="ending-block-title">{label}</div>
      <div className="props-grid dense">
        <label className="field compact span-2">
          Style
          <select
            value={ending.cap}
            onChange={(e) =>
              onChange({
                ...ending,
                cap: e.target.value as LineEnding["cap"],
              })
            }
          >
            {CAP_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field compact">
          Scale %
          <input
            type="number"
            min={50}
            max={350}
            step={5}
            value={ending.scalePercent}
            onChange={(e) =>
              onChange({
                ...ending,
                scalePercent: Math.min(350, Math.max(50, Number(e.target.value) || 100)),
              })
            }
          />
        </label>
        {showFill && (
          <label className="field-inline compact">
            <input
              type="checkbox"
              checked={ending.filled}
              onChange={(e) => onChange({ ...ending, filled: e.target.checked })}
            />
            Fill
          </label>
        )}
      </div>
    </div>
  );
}

export function patchStyleEnd(
  style: LineStyle,
  which: "start" | "end",
  end: LineEnding
): LineStyle {
  return which === "start" ? { ...style, start: end } : { ...style, end };
}
