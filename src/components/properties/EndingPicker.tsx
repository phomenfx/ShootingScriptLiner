import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { ChevronDown } from "lucide-react";
import { endingGeometry } from "../../lib/geometry";
import { renderLineCap } from "../../lib/lineCaps";
import { choiceEntries, choiceLabel } from "../../model/registry";
import type { Ending } from "../../model/types";
import type { LineCap } from "../../types/annotations";

/** Endings the page and the PDF can draw today. */
export const DRAWABLE_ENDINGS = ["none", "square", "circle", "diamond", "arrow", "arrowReversed", "doubleArrow", "bracket", "dot", "butt", "slash"];
/** Endings with an inside that can be filled. */
export const FILLABLE_ENDINGS = ["square", "circle", "diamond", "arrow", "arrowReversed", "doubleArrow"];

/** A short line ending in the given shape, pointing right. */
export function EndingSwatch({ type, filled }: { type: string; filled: boolean }) {
  const ending = { cap: type as LineCap, scalePercent: 130, filled };
  const tipX = 28;
  const inset = endingGeometry(ending, 1.25)?.shaftInsetPt ?? 0;
  const cap = renderLineCap(ending, "currentColor", 1.25, 0, false);
  return (
    <svg className="pf-ending-swatch" viewBox="0 0 34 16" aria-hidden="true">
      <line x1={2} y1={8} x2={tipX - inset} y2={8} stroke="currentColor" strokeWidth={1.25} strokeLinecap="round" />
      {cap && <g transform={`translate(${tipX}, 8)`}>{cap.elements}</g>}
    </svg>
  );
}

/** A menu of ending shapes, each shown as a preview with its name. */
export function EndingPicker({ label, value, onChange }: { label: string; value: Ending; onChange: (type: string) => void }) {
  const fillable = (type: string) => FILLABLE_ENDINGS.includes(type);
  const entries = choiceEntries("ending", undefined).filter((e) => DRAWABLE_ENDINGS.includes(e.key));
  return (
    <Dropdown.Root modal={false}>
      <Dropdown.Trigger className="pf-input pf-ending-trigger" aria-label={label} title={choiceLabel("ending", value.type)}>
        <EndingSwatch type={value.type} filled={fillable(value.type) && value.filled} />
        <span className="pf-ending-name">{choiceLabel("ending", value.type)}</span>
        <ChevronDown size={14} className="pf-ending-chevron" />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content className="menu pf-ending-menu" align="start" sideOffset={4}>
          {entries.map((entry) => (
            <Dropdown.Item
              key={entry.key}
              className="menu-item"
              role="menuitemradio"
              aria-checked={entry.key === value.type}
              onSelect={() => onChange(entry.key)}
            >
              <span className="menu-mark menu-mark-radio">{entry.key === value.type ? "●" : ""}</span>
              <EndingSwatch type={entry.key} filled={fillable(entry.key) && value.filled} />
              <span className="menu-text">{entry.label}</span>
            </Dropdown.Item>
          ))}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

/** Filled or outline, as one small toggle. Shapes without an inside show it off and greyed. */
export function FillToggle({ label, value, onChange }: { label: string; value: Ending; onChange: (filled: boolean) => void }) {
  const fillable = FILLABLE_ENDINGS.includes(value.type);
  const on = fillable && value.filled;
  return (
    <button
      type="button"
      className={on ? "pf-fill-toggle on" : "pf-fill-toggle"}
      aria-label={label}
      aria-pressed={on}
      disabled={!fillable}
      title={fillable ? (on ? "Filled. Click for outline." : "Outline. Click to fill.") : "This ending has no inside to fill"}
      onClick={() => onChange(!value.filled)}
    >
      <svg viewBox="0 0 14 14" aria-hidden="true">
        <rect x={2.5} y={2.5} width={9} height={9} rx={1.5} fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.25} />
      </svg>
    </button>
  );
}
