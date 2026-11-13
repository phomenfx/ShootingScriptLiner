/** Building blocks shared by every Properties form. */
import { fromPoints, lengthStep, toPoints } from "../../lib/units";
import { ChevronDown, ChevronRight, Lock, LockOpen, X } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { usePrefsStore } from "../../stores/prefsStore";

const ICON = { size: 13, strokeWidth: 1.75 } as const;

/* ---------- group ---------- */

type GroupProps = {
  /** Also the key its folded state is remembered under. */
  name: string;
  title: string;
  /** Small text after the title, such as "from scene 2". */
  note?: string;
  /** A group that can be off has its checkbox in the header. */
  enabled?: boolean;
  onEnabledChange?: (enabled: boolean) => void;
  children: ReactNode;
};

export function Group({ name, title, note, enabled, onEnabledChange, children }: GroupProps) {
  const folded = usePrefsStore((s) => !!s.foldedGroups[name]);
  const setFolded = usePrefsStore((s) => s.setGroupFolded);
  const bodyId = useId();
  return (
    <section className="pf-group">
      <header className="pf-group-head">
        {onEnabledChange && (
          <input
            type="checkbox"
            checked={enabled}
            aria-label={`${title} on`}
            onChange={(e) => onEnabledChange(e.target.checked)}
          />
        )}
        <button
          type="button"
          className="pf-group-title"
          aria-expanded={!folded}
          aria-controls={bodyId}
          onClick={() => setFolded(name, !folded)}
        >
          <span>
            {title}
            {note && <small> · {note}</small>}
          </span>
          {folded ? <ChevronRight {...ICON} /> : <ChevronDown {...ICON} />}
        </button>
      </header>
      {!folded && (
        <div className="pf-group-body" id={bodyId}>
          {children}
        </div>
      )}
    </section>
  );
}

/* ---------- field ---------- */

type FieldProps = {
  label: string;
  /** Explains the field on hover. Forms carry no explanatory text. */
  hint?: string;
  /** Print checkbox beside the label. */
  print?: boolean;
  onPrintChange?: (print: boolean) => void;
  /** Takes the full row instead of half. */
  wide?: boolean;
  children: ReactNode;
};

export function Field({ label, hint, print, onPrintChange, wide, children }: FieldProps) {
  return (
    <div className={`pf-field ${wide ? "pf-wide" : ""}`}>
      <span className="pf-label" title={hint}>
        {onPrintChange && (
          <input
            type="checkbox"
            checked={print}
            title={`Print ${label.toLowerCase()} in the caption`}
            aria-label={`Print ${label.toLowerCase()} in the caption`}
            onChange={(e) => onPrintChange(e.target.checked)}
          />
        )}
        {label}
      </span>
      {children}
    </div>
  );
}

/* ---------- inputs ---------- */

type TextInputProps = {
  value: string;
  label: string;
  placeholder?: string;
  disabled?: boolean;
  suggestions?: string[];
  multiline?: boolean;
  type?: "text" | "date";
  onChange: (value: string) => void;
  onBlur?: (value: string) => void;
};

export function TextInput({ value, label, placeholder, disabled, suggestions, multiline, type = "text", onChange, onBlur }: TextInputProps) {
  const listId = useId();
  if (multiline) {
    return (
      <textarea
        className="pf-input"
        rows={3}
        aria-label={label}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <>
      <input
        className="pf-input"
        type={type}
        aria-label={label}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        list={suggestions ? listId : undefined}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onBlur?.(e.target.value)}
      />
      {suggestions && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </>
  );
}

/**
 * A text box that changes nothing until Enter or leaving it, for values whose
 * change moves things around (scene and shot numbers). Escape puts it back.
 */
export function CommitInput({ value, label, placeholder, onCommit }: { value: string; label: string; placeholder?: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null && draft.trim() !== value) onCommit(draft.trim());
    setDraft(null);
  };
  return (
    <input
      className="pf-input"
      aria-label={label}
      value={draft ?? value}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        else if (e.key === "Escape") {
          setDraft(null);
          e.stopPropagation();
        }
      }}
    />
  );
}

type NumberInputProps = {
  value: number | undefined;
  label: string;
  min: number;
  /** Leave out for no upper limit. */
  max?: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  /** `undefined` when the field is cleared, where the field allows that. */
  onChange: (value: number | undefined) => void;
  allowEmpty?: boolean;
};

/** A number with its unit inside the field. Typing is free; the value is applied when it is valid. */
export function NumberInput(props: NumberInputProps) {
  // "len": a length stored in points, shown in the chosen unit.
  const lengthUnit = usePrefsStore((s) => s.lengthUnit);
  if (props.unit !== "len") return <PlainNumberInput {...props} />;
  const u = lengthUnit;
  const { value, min, max, step = 1, onChange } = props;
  return (
    <PlainNumberInput
      {...props}
      unit={u}
      value={value === undefined ? undefined : fromPoints(value, u)}
      min={fromPoints(min, u)}
      max={max === undefined ? undefined : fromPoints(max, u)}
      step={lengthStep(step, u)}
      onChange={(v) => onChange(v === undefined ? undefined : toPoints(v, u))}
    />
  );
}

function PlainNumberInput({ value, label, min, max, step = 1, unit, disabled, onChange, allowEmpty }: NumberInputProps) {
  const [draft, setDraft] = useState(value === undefined ? "" : String(value));
  useEffect(() => setDraft(value === undefined ? "" : String(value)), [value]);
  return (
    <span className="pf-number">
      <input
        className="pf-input"
        type="number"
        aria-label={label}
        value={draft}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => {
          setDraft(e.target.value);
          if (e.target.value === "") {
            if (allowEmpty) onChange(undefined);
            return;
          }
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n >= min && (max === undefined || n <= max)) onChange(n);
        }}
        onBlur={() => setDraft(value === undefined ? "" : String(value))}
      />
      {unit && <span className="pf-unit">{unit}</span>}
    </span>
  );
}

export function Select({
  value,
  label,
  options,
  disabled,
  onChange,
}: {
  value: string;
  label: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const known = options.some((option) => option.value === value);
  return (
    <select className="pf-input" aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {!known && <option value={value}>{value}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function Segmented<T extends string>({
  value,
  label,
  options,
  onChange,
}: {
  value: T;
  label: string;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="pf-segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          title={option.title}
          className={option.value === value ? "on" : undefined}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Toggle buttons such as B / I / U. */
export function Toggles({ items }: { items: { label: ReactNode; title: string; on: boolean; onChange: (on: boolean) => void }[] }) {
  return (
    <div className="pf-segmented">
      {items.map((item) => (
        <button
          key={item.title}
          type="button"
          aria-pressed={item.on}
          title={item.title}
          aria-label={item.title}
          className={item.on ? "on" : undefined}
          onClick={() => item.onChange(!item.on)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- chips ---------- */

type ChipsProps = {
  values: string[];
  label: string;
  placeholder?: string;
  disabled?: boolean;
  suggestions?: string[];
  /** Shown text for a stored value, when they differ (tag keys). */
  display?: (value: string) => string;
  onChange: (values: string[]) => void;
};

/** A list of values as chips. Enter or a semicolon adds one; Backspace on an empty box removes the last. */
export function Chips({ values, label, placeholder = "Add…", disabled, suggestions, display, onChange }: ChipsProps) {
  const [draft, setDraft] = useState("");
  const listId = useId();
  const add = (text: string) => {
    const parts = text.split(";").map((part) => part.trim()).filter(Boolean);
    setDraft("");
    const next = [...values];
    for (const part of parts) if (!next.includes(part)) next.push(part);
    if (next.length !== values.length) onChange(next);
  };
  return (
    <div className={`pf-chips ${disabled ? "is-disabled" : ""}`}>
      {values.map((value) => (
        <span className="pf-chip" key={value}>
          {display ? display(value) : value}
          {!disabled && (
            <button type="button" aria-label={`Remove ${display ? display(value) : value}`} onClick={() => onChange(values.filter((v) => v !== value))}>
              <X size={11} strokeWidth={2} />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <input
          aria-label={label}
          value={draft}
          placeholder={placeholder}
          list={suggestions ? listId : undefined}
          onChange={(e) => (e.target.value.includes(";") ? add(e.target.value) : setDraft(e.target.value))}
          onBlur={() => draft.trim() && add(draft)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && draft === "" && values.length > 0) {
              onChange(values.slice(0, -1));
            }
          }}
        />
      )}
      {suggestions && (
        <datalist id={listId}>
          {suggestions.filter((s) => !values.includes(s)).map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  );
}

/* ---------- locks and colors ---------- */

/** The lock inside a field that can follow something else (its scene, or its shot's color). */
export function LockButton({ locked, what, onToggle }: { locked: boolean; what: string; onToggle: () => void }) {
  const title = locked ? `Follows ${what}. Click to set its own.` : `Has its own value. Click to follow ${what} again.`;
  return (
    <button type="button" className={`pf-lock ${locked ? "is-locked" : ""}`} title={title} aria-label={title} aria-pressed={locked} onClick={onToggle}>
      {locked ? <Lock {...ICON} /> : <LockOpen {...ICON} />}
    </button>
  );
}

/** Wraps an input with a lock at its right edge. */
export function Lockable({ locked, what, onToggle, children }: { locked: boolean; what: string; onToggle: () => void; children: ReactNode }) {
  return (
    <div className={`pf-lockable ${locked ? "is-locked" : ""}`}>
      {children}
      <LockButton locked={locked} what={what} onToggle={onToggle} />
    </div>
  );
}

/**
 * A color that is either the mark's own or follows its shot. Following shows
 * "Shot" with a lock. Either way the picker opens; while following, it
 * recolors the shot, like other locked fields edit what they follow.
 */
export function ColorField({
  color,
  label,
  follows,
  onChange,
  onFollowChange,
}: {
  color: string;
  label: string;
  /** Undefined when there is nothing to follow (an unlinked mark, or a shot's own color). */
  follows?: boolean;
  onChange: (color: string) => void;
  onFollowChange?: (follows: boolean) => void;
}) {
  return (
    <div className={`pf-color ${follows ? "is-locked" : ""}`}>
      <input type="color" aria-label={label} value={color} title={follows ? "Changes the shot's color" : undefined} onChange={(e) => onChange(e.target.value)} />
      <span>{follows ? "Shot" : color.toUpperCase()}</span>
      {follows !== undefined && onFollowChange && (
        <LockButton locked={follows} what="the shot's color" onToggle={() => onFollowChange(!follows)} />
      )}
    </div>
  );
}

/* ---------- footer ---------- */

export function Footer({ children }: { children: ReactNode }) {
  return <footer className="pf-footer">{children}</footer>;
}

export function FooterButton({
  danger,
  disabled,
  title,
  onClick,
  children,
}: {
  danger?: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className={`pf-btn ${danger ? "pf-btn-danger" : ""}`} disabled={disabled} title={title} onClick={onClick}>
      {children}
    </button>
  );
}
