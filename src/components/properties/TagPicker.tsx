/*
 * A field of tags with a list to pick from. Clicking the field opens the
 * project's suggestions for it; typing filters them, and Enter adds what was
 * typed (new values join the project's list). A single field (shot type,
 * angle, FPS) holds one tag: picking another replaces it.
 */
import { X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { usePrefsStore } from "../../stores/prefsStore";
import { breakUndoGroup, useProjectStore } from "../../stores/projectStore";
import { updateSettings } from "../../model/edits";
import { rememberSuggestions, suggestionsFor, type SuggestionField } from "../../model/suggestions";

type Props = {
  field: SuggestionField;
  values: string[];
  label: string;
  placeholder?: string;
  single?: boolean;
  disabled?: boolean;
  /** How a stored value reads (an angle key shows as its label). */
  display?: (value: string) => string;
  onChange: (values: string[]) => void;
};

export function TagPicker({ field, values, label, placeholder = "Add…", single, disabled, display = (v) => v, onChange }: Props) {
  const project = useProjectStore((s) => s.project);
  const myDefaults = usePrefsStore((s) => s.suggestionDefaults);
  const list = suggestionsFor(project, field, myDefaults);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const shown = values.map(display);
  const lower = draft.trim().toLowerCase();
  const options = useMemo(
    () => list.filter((s) => (single || !shown.includes(s)) && (!lower || s.toLowerCase().includes(lower))),
    [list, shown.join("\u0000"), lower, single]
  );

  /** Puts the chosen values in, and adds any new ones to the project's list. */
  const commit = (next: string[]) => {
    breakUndoGroup();
    useProjectStore.getState().apply(updateSettings((s) => rememberSuggestions(s, field, list, next.map(display))));
    onChange(next);
    breakUndoGroup();
  };
  const pick = (text: string) => {
    const value = text.trim();
    setDraft("");
    setActive(0);
    if (!value) return;
    if (single) {
      commit([value]);
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (shown.some((v) => v.toLowerCase() === value.toLowerCase())) return;
    commit([...values, value]);
  };

  return (
    <div className={`pf-chips tag-picker ${disabled ? "is-disabled" : ""}`} onMouseDown={(e) => {
      // A click anywhere in the box opens the list.
      if (disabled) return;
      setOpen(true);
      if (e.target === inputRef.current) return;
      if (!(e.target as HTMLElement).closest("button")) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }}>
      {values.map((value, i) => (
        <span className="pf-chip" key={`${value}-${i}`}>
          {shown[i]}
          {!disabled && (
            <button type="button" aria-label={`Remove ${shown[i]}`} onClick={() => onChange(values.filter((_, j) => j !== i))}>
              <X size={11} strokeWidth={2} />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <input
          ref={inputRef}
          aria-label={label}
          aria-expanded={open}
          value={draft}
          placeholder={single && values.length > 0 ? "" : placeholder}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setOpen(false);
            if (draft.trim()) pick(draft);
          }}
          onChange={(e) => {
            setOpen(true);
            setActive(0);
            if (e.target.value.includes(";")) e.target.value.split(";").forEach((part) => pick(part));
            else setDraft(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(options.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              // The highlighted suggestion when the typed text matches one, else the typed text.
              const exact = options.find((o) => o.toLowerCase() === lower);
              pick(exact ?? (draft.trim() ? draft : (options[active] ?? "")));
            } else if (e.key === "Escape") {
              setOpen(false);
              setDraft("");
            } else if (e.key === "Backspace" && draft === "" && values.length > 0) {
              onChange(values.slice(0, -1));
            }
          }}
        />
      )}
      {open && !disabled && options.length > 0 && (
        <div className="tag-picker-list" role="listbox" aria-label={`${label} suggestions`}>
          {options.map((option, i) => (
            <button
              type="button"
              role="option"
              key={option}
              aria-selected={single ? shown[0] === option : false}
              className={`tag-picker-option${i === active ? " is-active" : ""}${single && shown[0] === option ? " is-chosen" : ""}`}
              // Keep focus in the field so the list stays open for the next pick.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(option)}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
