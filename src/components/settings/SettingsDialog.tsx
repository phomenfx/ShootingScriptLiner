import { APP_VERSION, LICENSE_URL, REPO_URL } from "../../lib/about";
import { defaultsFromProject, SUGGESTION_FIELDS, suggestionsFor } from "../../model/suggestions";
import { fromPoints, lengthStep, toPoints, type LengthUnit } from "../../lib/units";
import { clearRevisionTags, REVISION_COLORS, revisionColor } from "../../model/revisions";
import * as Dialog from "@radix-ui/react-dialog";
import { EndingPicker, FillToggle } from "../properties/EndingPicker";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  FileText,
  Film,
  Gauge,
  Info,
  Keyboard,
  List,
  ListPlus,
  MousePointer2,
  Palette,
  PenLine,
  Search,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toLegacyProject } from "../../legacy/legacyView";
import { formatExcelDate } from "../../lib/dateFormat";
import { getFontOptions, loadBundledFonts } from "../../lib/fonts";
import { formatLineCaption } from "../../lib/lineCaption";
import { CAPTION_DIVIDERS, customDividerSeed, isCaptionDivider } from "../../model/captions";
import { defaultSettings } from "../../model/defaults";
import { setName, updateSettings } from "../../model/edits";
import { setShotIdStyle } from "../../model/numbering";
import { clearAutosave } from "../../io/autosave";
import { CAPTION_FIELDS, choiceEntries, isCaptionFieldId } from "../../model/registry";
import type { CaptionDivider, Ending, LineDefaults, Outline, ProjectSettings, ShapeDefaults, TextDefaults, WaveSide } from "../../model/types";
import { patternFields, tuneLabel, type TuneField } from "../../lib/strokeGeometry";
import { editStrokeTune, tunePercent } from "../../model/segments";
import { useProjectStore } from "../../stores/projectStore";
import { usePrefsStore } from "../../stores/prefsStore";
import { useSessionStore } from "../../stores/sessionStore";
import {
  MAX_LINE_HIT_TOLERANCE_PX,
  MAX_MAX_MOUNTED_PDF_PAGES,
  MIN_LINE_HIT_TOLERANCE_PX,
  MIN_MAX_MOUNTED_PDF_PAGES,
  UI_SCALES,
  type ColorTheme,
  type UiScale,
} from "../../types/appPreferences";
import { PatternPicker } from "../properties/PatternPicker";
import { ToolKeybindSettings } from "../ToolKeybindSettings";

/* Endings the script can draw today. The newer ones join with the next step. */

const DATE_CODES =
  "m 1–12 · mm 01–12 · mmm Jan · mmmm January\nd 1–31 · dd 01–31 · ddd Sun · dddd Sunday\nyy 00–99 · yyyy 1900–9999";

/** Mouse and drawing moves that have no key of their own. */
const GESTURES: [string, string][] = [
  ["Draw a line with a new shot", "Ctrl+drag (Line tool)"],
  ["Snap a line, edge or rotation", "Shift (when Snap is off)"],
  ["Copy a line while dragging it", "Alt+drag"],
  ["Split a line at a point", "Double-click the line"],
  ["Square shape / keep proportions", "Shift while drawing or resizing"],
  ["Straight segment with the Pen", "Hold Shift"],
  ["Polygon: close / finish open / undo corner / cancel", "Click first corner / Enter or double-click / Backspace / Esc"],
  ["Actions for anything", "Right-click"],
  ["Table: edit a cell / paste a block", "Type or Enter / Ctrl+V"],
];

/** A white halo reads well on a script page. */
const DEFAULT_OUTLINE: Outline = { color: "#FFFFFF", widthPt: 1.5 };

const FIXED_SHORTCUTS: [string, string][] = [
  ["Save", "Ctrl+S"],
  ["Settings", "Ctrl+,"],
  ["Find on script", "Ctrl+F (Enter / Shift+Enter: next / previous)"],
  ["This list of shortcuts", "?"],
  ["Open", "Ctrl+O"],
  ["Export lined PDF", "Ctrl+E"],
  ["Undo", "Ctrl+Z"],
  ["Redo", "Ctrl+Shift+Z"],
  ["Cut / Copy / Paste", "Ctrl+X / C / V"],
  ["Paste in place", "Ctrl+Shift+V"],
  ["Duplicate", "Ctrl+D"],
  ["Lock in place / unlock", "Ctrl+L"],
  ["Hide shot (selected shot, or a selected line's shot)", "Ctrl+H"],
  ["Hide scene", "Ctrl+Shift+H"],
  ["Show everything hidden", "Alt+H"],
  ["Delete", "Del"],
  ["Deselect", "Esc"],
  ["Zoom in / out / fit", "Ctrl+= / - / 0"],
  ["Toggle snap", "S"],
  ["Snap angle while drawing", "Hold Shift"],
];

type Row = { label: string; control: ReactNode; hint?: string; stacked?: boolean };
type Section = {
  id: string;
  group: "Project" | "Preferences";
  title: string;
  icon: ReactNode;
  rows: Row[];
};

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="set-segmented" role="radiogroup">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={option.value === value ? "on" : undefined}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function strokeTuneRow(stroke: LineDefaults["stroke"], field: TuneField, onChange: (stroke: LineDefaults["stroke"]) => void): Row {
  const label = tuneLabel(stroke.pattern, field);
  if (field === "side") {
    return {
      label,
      hint: "Which side the wavy strand sits on, looking along the line.",
      control: (
        <Segmented
          value={stroke.waveSide ?? "right"}
          options={[
            { value: "left", label: "Left" },
            { value: "right", label: "Right" },
          ]}
          onChange={(waveSide: WaveSide) => onChange(editStrokeTune(stroke, "side", waveSide))}
        />
      ),
    };
  }
  return {
    label,
    hint: tuneHint(field),
    control: (
      <NumberField
        value={tunePercent(stroke, field)}
        min={25}
        step={5}
        unit="%"
        onChange={(next) => onChange(editStrokeTune(stroke, field, next))}
      />
    ),
  };
}

function tuneHint(field: TuneField): string {
  if (field === "length") return "Dash or dot size, or the distance from one crest to the next.";
  if (field === "gap") return "Space between the marks or the strands.";
  return "How far the wave or zigzag swings.";
}

/** A number in Settings. Unit "len" is a length stored in points, shown in the chosen unit. */
function NumberField(props: { value: number; min: number; max?: number; step?: number; unit?: string; onChange: (value: number) => void }) {
  const u = usePrefsStore((s) => s.lengthUnit);
  if (props.unit !== "len") return <PlainNumberField {...props} />;
  return (
    <PlainNumberField
      value={fromPoints(props.value, u)}
      min={fromPoints(props.min, u)}
      max={props.max === undefined ? undefined : fromPoints(props.max, u)}
      step={lengthStep(props.step ?? 1, u)}
      unit={u}
      onChange={(v) => props.onChange(toPoints(v, u))}
    />
  );
}

function PlainNumberField({
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
}: {
  value: number;
  min: number;
  /** Leave out for no upper limit. */
  max?: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  return (
    <span className="set-number">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(n)) onChange(Math.max(min, max === undefined ? n : Math.min(max, n)));
        }}
      />
      {unit && <span className="set-unit">{unit}</span>}
    </span>
  );
}

/** Font, size and bold for captions or notes. */
function FontField({
  style,
  fonts,
  onChange,
}: {
  style: { font: string; sizePt: number; bold: boolean };
  fonts: { value: string; label: string }[];
  onChange: (patch: { font?: string; sizePt?: number; bold?: boolean }) => void;
}) {
  return (
    <span className="set-inline">
      <select value={style.font} onChange={(e) => onChange({ font: e.target.value })}>
        {!fonts.some((font) => font.value === style.font) && <option value={style.font}>{style.font}</option>}
        {fonts.map((font) => (
          <option key={font.value} value={font.value}>
            {font.label}
          </option>
        ))}
      </select>
      <NumberField value={style.sizePt} min={4} max={96} unit="pt" onChange={(sizePt) => onChange({ sizePt })} />
      <label className="set-check">
        <input type="checkbox" checked={style.bold} onChange={(e) => onChange({ bold: e.target.checked })} />
        Bold
      </label>
    </span>
  );
}

function EndingField({ value, onChange }: { value: Ending; onChange: (value: Ending) => void }) {
  return (
    <span className="set-inline set-ending">
      <EndingPicker label="Ending shape" value={value} onChange={(type) => onChange({ ...value, type })} />
      <NumberField value={value.sizePct} min={50} step={10} unit="%" onChange={(sizePct) => onChange({ ...value, sizePct })} />
      <FillToggle label="Fill the ending" value={value} onChange={(filled) => onChange({ ...value, filled })} />
    </span>
  );
}

function TagsField({
  tags,
  onChange,
}: {
  tags: { key: string; label: string }[];
  onChange: (tags: { key: string; label: string }[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const label = draft.trim();
    setDraft("");
    if (!label || tags.some((tag) => tag.label.toLowerCase() === label.toLowerCase())) return;
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tag";
    let key = `custom:${slug}`;
    for (let n = 2; tags.some((tag) => tag.key === key); n += 1) key = `custom:${slug}-${n}`;
    onChange([...tags, { key, label }]);
  };
  return (
    <div className="set-tags">
      {tags.map((tag) => (
        <span className="set-tag" key={tag.key}>
          {tag.label}
          <button type="button" aria-label={`Remove ${tag.label}`} onClick={() => onChange(tags.filter((t) => t.key !== tag.key))}>
            ×
          </button>
        </span>
      ))}
      <input
        placeholder="Add tag…"
        aria-label="Add tag"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={add}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
      />
    </div>
  );
}

/** A list of plain values (a field's dropdown): remove with ×, add by typing and Enter. */
function ValueListField({ values, label, onChange }: { values: string[]; label: string; onChange: (values: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const parts = draft.split(";").map((p) => p.trim()).filter(Boolean);
    setDraft("");
    const next = [...values];
    for (const part of parts) if (!next.some((v) => v.toLowerCase() === part.toLowerCase())) next.push(part);
    if (next.length !== values.length) onChange(next);
  };
  return (
    <div className="set-tags">
      {values.map((value) => (
        <span className="set-tag" key={value}>
          {value}
          <button type="button" aria-label={`Remove ${value}`} onClick={() => onChange(values.filter((v) => v !== value))}>
            ×
          </button>
        </span>
      ))}
      <input
        placeholder="Add…"
        aria-label={`Add to ${label}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={add}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
      />
    </div>
  );
}

export function SettingsDialog() {
  const open = useSessionStore((s) => s.settingsOpen);
  const setOpen = useSessionStore((s) => s.setSettingsOpen);
  const project = useProjectStore((s) => s.project);
  const apply = useProjectStore((s) => s.apply);
  const prefs = usePrefsStore();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState("general");
  const [, setFontsReady] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) void loadBundledFonts().then(() => setFontsReady(true));
    else setQuery("");
  }, [open]);

  const s = project.settings;
  const set = (recipe: (settings: ProjectSettings) => ProjectSettings) => apply(updateSettings(recipe));
  const setGeneral = (patch: Partial<ProjectSettings["general"]>) =>
    set((p) => ({ ...p, general: { ...p.general, ...patch } }));
  const setCaptions = (patch: Partial<ProjectSettings["captions"]>) =>
    set((p) => ({ ...p, captions: { ...p.captions, ...patch } }));
  const setDrawing = (patch: Partial<ProjectSettings["drawing"]>) =>
    set((p) => ({ ...p, drawing: { ...p.drawing, ...patch } }));
  const setLine = (patch: Partial<LineDefaults>) =>
    set((p) => ({ ...p, markDefaults: { ...p.markDefaults, line: { ...p.markDefaults.line, ...patch } } }));
  const setCaptionStyle = (patch: Partial<LineDefaults["caption"]>) =>
    set((p) => ({ ...p, markDefaults: { ...p.markDefaults, line: { ...p.markDefaults.line, caption: { ...p.markDefaults.line.caption, ...patch } } } }));
  const setNote = (patch: Partial<TextDefaults>) =>
    set((p) => ({ ...p, markDefaults: { ...p.markDefaults, text: { ...p.markDefaults.text, ...patch } } }));
  const setShape = (patch: Partial<ShapeDefaults>) =>
    set((p) => ({ ...p, markDefaults: { ...p.markDefaults, shape: { ...p.markDefaults.shape, ...patch } } }));
  /** One default outline for every new mark: lines, their captions, shapes and notes. */
  const setOutline = (outline: Outline | undefined) =>
    set((p) => {
      const strip = <T extends { outline?: Outline }>(d: T): T => {
        const { outline: _removed, ...rest } = d;
        return (outline ? { ...rest, outline: { ...outline } } : rest) as T;
      };
      const line = strip(p.markDefaults.line);
      if (outline) line.captionOutline = { ...outline };
      else delete line.captionOutline;
      return { ...p, markDefaults: { ...p.markDefaults, line, shape: strip(p.markDefaults.shape), text: strip(p.markDefaults.text) } };
    });

  // Every caption field the project stores, including Angle, Cast, Tags and Setup.
  const captionFields = s.captions.fields.filter((field) => isCaptionFieldId(field.id));
  const moveField = (id: string, step: -1 | 1) => {
    const index = captionFields.findIndex((field) => field.id === id);
    const other = captionFields[index + step];
    if (!other) return;
    const fields = [...s.captions.fields];
    const a = fields.findIndex((field) => field.id === id);
    const b = fields.findIndex((field) => field.id === other.id);
    [fields[a], fields[b]] = [fields[b]!, fields[a]!];
    setCaptions({ fields });
  };

  const legacy = toLegacyProject(project);
  const sampleScene = legacy.scenes.find((scene) => scene.shots.length > 0);
  const captionPreview = sampleScene
    ? formatLineCaption(sampleScene, sampleScene.shots[0]!, legacy) || "—"
    : "Add a shot to see a preview";

  const line = s.markDefaults.line;
  const note = s.markDefaults.text;
  const shape = s.markDefaults.shape;
  const outline = shape.outline ?? line.outline ?? note.outline;
  const fonts = getFontOptions();
  const icon = { size: 15, strokeWidth: 1.75 } as const;

  const sections: Section[] = [
    {
      id: "general",
      group: "Project",
      title: "General",
      icon: <FileText {...icon} />,
      rows: [
        {
          label: "Project name",
          control: <input type="text" className="set-wide" value={project.name} onChange={(e) => apply(setName(e.target.value))} />,
        },
        {
          label: "Default color",
          hint: "New shots, lines and shapes start with this color (notes use Note color). The color bar above Properties sets it too.",
          control: (
            <span className="set-color">
              <input type="color" value={s.general.newShotColor} onChange={(e) => setGeneral({ newShotColor: e.target.value })} />
              {s.general.newShotColor}
            </span>
          ),
        },
        {
          label: "Date format",
          hint: "Shown in captions and the lined PDF. The shot list CSV always writes YYYY-MM-DD.",
          control: (
            <span className="set-inline">
              <input type="text" className="set-short" value={s.captions.dateFormat} onChange={(e) => setCaptions({ dateFormat: e.target.value })} />
              <span className="set-help" title={DATE_CODES} aria-label={`Date codes: ${DATE_CODES}`}>
                ?
              </span>
              <span className="set-preview">{formatExcelDate("2012-03-14", s.captions.dateFormat) || "—"}</span>
            </span>
          ),
        },
        {
          label: "Autosave",
          hint: "Keeps unsaved work in this browser and offers it back on the next start. Saving to a file is still how you keep a project.",
          control: (
            <span className="set-inline">
              <label className="set-check">
                <input type="checkbox" checked={prefs.autosave} onChange={(e) => prefs.setAutosave(e.target.checked)} />
                Keep unsaved work in this browser
              </label>
              <select
                aria-label="How often"
                value={prefs.autosaveSeconds}
                disabled={!prefs.autosave}
                onChange={(e) => prefs.setAutosaveSeconds(Number(e.target.value))}
              >
                <option value={3}>A few seconds after a change</option>
                <option value={30}>At most every 30 seconds</option>
                <option value={60}>At most every minute</option>
                <option value={300}>At most every 5 minutes</option>
              </select>
              <button type="button" className="dialog-btn" onClick={clearAutosave}>
                Discard saved copy
              </button>
            </span>
          ),
        },
        {
          label: "Restore points",
          hint: "Earlier copies of your work, about every 5 minutes, kept in this browser even after you save. Open one if you need to go back.",
          control: (
            <span className="set-inline">
              <select aria-label="Restore points to keep" value={prefs.restorePoints} onChange={(e) => prefs.setRestorePoints(Number(e.target.value))}>
                <option value={0}>Keep none</option>
                <option value={3}>Keep 3</option>
                <option value={5}>Keep 5</option>
                <option value={10}>Keep 10</option>
              </select>
              <button type="button" className="dialog-btn" onClick={() => useSessionStore.getState().setRestorePointsOpen(true)}>
                Restore an earlier copy…
              </button>
            </span>
          ),
        },
      ],
    },
    {
      id: "shots",
      group: "Project",
      title: "Shots",
      icon: <Film {...icon} />,
      rows: [
        {
          label: "Shot IDs",
          hint: "Shots count on in list order unless you type a Shot # (gaps like 1A, 1C are fine). Switching converts typed numbers too.",
          control: (
            <Segmented
              value={s.general.shotIdStyle}
              options={[
                { value: "letter", label: "Letters · 1A, 1B" },
                { value: "decimal", label: "Numbers · 1.1, 1.2" },
              ]}
              onChange={(shotIdStyle) => useProjectStore.getState().apply((p) => setShotIdStyle(p, shotIdStyle))}
            />
          ),
        },
        {
          label: "Script revisions",
          hint: "For scripts that go out in colored revision pages. While on, shots that are added or changed, or whose lines change, get the current revision's color tag.",
          control: (
            <label className="set-inline">
              <input
                type="checkbox"
                checked={!!s.revisions?.enabled}
                onChange={(e) => set((p) => ({ ...p, revisions: { current: p.revisions?.current ?? "white", enabled: e.target.checked } }))}
              />
              Track revisions
            </label>
          ),
        },
        ...(s.revisions?.enabled
          ? [
              {
                label: "Current revision",
                control: (
                  <span className="set-inline">
                    <span className="revision-chip" style={{ background: revisionColor(s.revisions.current) }} />
                    <select value={s.revisions.current} onChange={(e) => set((p) => ({ ...p, revisions: { enabled: true, current: e.target.value } }))}>
                      {REVISION_COLORS.map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="dialog-btn" onClick={() => useProjectStore.getState().apply(clearRevisionTags)}>
                      Clear all tags
                    </button>
                  </span>
                ),
              },
            ]
          : []),
        {
          label: "New shot status",
          control: (
            <select value={s.general.newShotStatus ?? "planned"} onChange={(e) => setGeneral({ newShotStatus: e.target.value })}>
              {choiceEntries("status", s.lists).map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.label}
                </option>
              ))}
            </select>
          ),
        },
        {
          label: "New shot priority",
          control: (
            <select value={s.general.newShotPriority} onChange={(e) => setGeneral({ newShotPriority: e.target.value })}>
              {choiceEntries("priority", s.lists).map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.label}
                </option>
              ))}
            </select>
          ),
        },
        {
          label: "Shot tags",
          control: <TagsField tags={s.lists.tags ?? []} onChange={(tags) => set((p) => ({ ...p, lists: { ...p.lists, tags } }))} />,
        },
      ],
    },
    {
      id: "suggestions",
      group: "Project",
      title: "Suggestions",
      icon: <ListPlus {...icon} />,
      rows: [
        ...SUGGESTION_FIELDS.map((f) => ({
          label: f.label,
          hint:
            f.id === "cast"
              ? "This project's cast. It stays with the project and is never saved as your default."
              : f.single
                ? "Offered in the field's dropdown; you can still type anything."
                : "Offered when you click the field. Values you type there are added here.",
          stacked: true,
          control: (
            <ValueListField
              label={f.label}
              values={suggestionsFor(project, f.id, prefs.suggestionDefaults)}
              onChange={(values) => set((p) => ({ ...p, suggestions: { ...p.suggestions, [f.id]: values } }))}
            />
          ),
        })),
        {
          label: "My defaults",
          hint: "New projects start with your default lists. Cast is never included.",
          control: (
            <span className="set-inline">
              <button
                type="button"
                className="dialog-btn"
                onClick={() => {
                  prefs.setSuggestionDefaults(defaultsFromProject(project, prefs.suggestionDefaults));
                  useSessionStore.getState().flashNotice("Saved these lists (all but Cast) as your defaults.");
                }}
              >
                Save as my defaults
              </button>
              <button
                type="button"
                className="dialog-btn"
                title="Replace this project's lists (all but Cast) with your defaults"
                onClick={() =>
                  set((p) => ({ ...p, suggestions: p.suggestions?.cast ? { cast: p.suggestions.cast } : undefined }))
                }
              >
                Use my defaults
              </button>
            </span>
          ),
        },
      ],
    },
    {
      id: "captions",
      group: "Project",
      title: "Captions",
      icon: <List {...icon} />,
      rows: [
        { label: "Preview", control: <span className="set-preview set-preview-mono">{captionPreview}</span> },
        {
          label: "Caption font",
          control: <FontField style={line.caption} fonts={fonts} onChange={setCaptionStyle} />,
        },
        {
          label: "Fields and order",
          hint: "The divider joins that field to the one before it. Parentheses, brackets, braces and quotes wrap the field, so the defaults read 1A-WS Subject (Info). Custom uses … for the value, as in “ (…)”. A shot can still turn a field off for itself.",
          control: (
            <ul className="set-fields">
              {captionFields.map((field, index) => {
                const label = CAPTION_FIELDS.find((f) => f.id === field.id)?.label ?? field.id;
                const chooseDivider = (divider: CaptionDivider) =>
                  setCaptions({
                    fields: s.captions.fields.map((item) => {
                      if (item.id !== field.id) return item;
                      if (divider !== "custom") {
                        const { dividerText: _removed, ...rest } = item;
                        return { ...rest, divider };
                      }
                      return { ...item, divider, dividerText: item.dividerText ?? customDividerSeed(item.divider) };
                    }),
                  });
                return (
                  <li key={field.id}>
                    <label className="set-check">
                      <input
                        type="checkbox"
                        checked={field.print}
                        onChange={(e) =>
                          setCaptions({
                            fields: s.captions.fields.map((f) => (f.id === field.id ? { ...f, print: e.target.checked } : f)),
                          })
                        }
                      />
                      {label}
                    </label>
                    <select
                      className="set-divider"
                      aria-label={`Divider for ${label}`}
                      title="Joins this field to the previous one. Wrapping choices surround the field."
                      value={field.divider ?? "space"}
                      onChange={(e) => {
                        if (isCaptionDivider(e.target.value)) chooseDivider(e.target.value);
                      }}
                    >
                      {CAPTION_DIVIDERS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {field.divider === "custom" && (
                      <input
                        type="text"
                        className="set-divider-text"
                        aria-label={`Custom divider for ${label}`}
                        title="… stands for this field. “ (…)” wraps it, and “-…” joins it with a hyphen."
                        value={field.dividerText ?? ""}
                        maxLength={32}
                        onChange={(e) =>
                          setCaptions({
                            fields: s.captions.fields.map((item) =>
                              item.id === field.id ? { ...item, dividerText: e.target.value } : item
                            ),
                          })
                        }
                      />
                    )}
                    <button type="button" aria-label={`Move ${label} up`} title="Move up" disabled={index === 0} onClick={() => moveField(field.id, -1)}>
                      <ArrowUp size={13} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${label} down`}
                      title="Move down"
                      disabled={index === captionFields.length - 1}
                      onClick={() => moveField(field.id, 1)}
                    >
                      <ArrowDown size={13} />
                    </button>
                  </li>
                );
              })}
            </ul>
          ),
        },
        {
          label: "Offset across",
          hint: "How far a caption starts to the right of its line's first point. Negative moves it to the left, beside the line.",
          control: <NumberField value={s.captions.offsetAcrossPt} min={-400} max={400} unit="len" onChange={(offsetAcrossPt) => setCaptions({ offsetAcrossPt })} />,
        },
        {
          label: "Offset up",
          hint: "Negative moves the caption below the line's first point.",
          control: <NumberField value={s.captions.offsetAbovePt} min={-200} max={200} unit="len" onChange={(offsetAbovePt) => setCaptions({ offsetAbovePt })} />,
        },
        {
          label: '"(cont.)" gap',
          hint: "Space between the end of a continued line and its (cont.) caption.",
          control: <NumberField value={s.captions.contGapPt} min={0} max={48} unit="len" onChange={(contGapPt) => setCaptions({ contGapPt })} />,
        },
      ],
    },
    {
      id: "mark-defaults",
      group: "Project",
      title: "Mark defaults",
      icon: <PenLine {...icon} />,
      rows: [
        {
          label: "Line pattern",
          control: (
            <PatternPicker
              value={line.stroke.pattern}
              onChange={(pattern) => setLine({ stroke: { ...line.stroke, pattern } })}
            />
          ),
        },
        {
          label: "Line thickness",
          control: <NumberField value={line.stroke.widthPt} min={0.25} max={24} step={0.25} unit="len" onChange={(widthPt) => setLine({ stroke: { ...line.stroke, widthPt } })} />,
        },
        ...patternFields(line.stroke.pattern).map((field) => strokeTuneRow(line.stroke, field, (stroke) => setLine({ stroke }))),
        { label: "Line start", control: <EndingField value={line.start} onChange={(start) => setLine({ start })} /> },
        { label: "Line end", control: <EndingField value={line.end} onChange={(end) => setLine({ end })} /> },
        {
          label: "New lines copy the last line",
          hint: "A new line takes the style of the line drawn before it instead of these defaults.",
          control: (
            <input type="checkbox" checked={s.drawing.newLineCopiesPrevious} onChange={(e) => setDrawing({ newLineCopiesPrevious: e.target.checked })} />
          ),
        },
        {
          label: "Note color",
          control: (
            <span className="set-color">
              <input type="color" value={note.color} onChange={(e) => setNote({ color: e.target.value })} />
              {note.color}
            </span>
          ),
        },
        {
          label: "Note font",
          control: <FontField style={note.style} fonts={fonts} onChange={(patch) => setNote({ style: { ...note.style, ...patch } })} />,
        },
        {
          label: "Shape thickness",
          control: (
            <NumberField
              value={shape.stroke?.widthPt ?? 2}
              min={0.25}
              max={24}
              step={0.25}
              unit="len"
              onChange={(widthPt) => setShape({ stroke: { ...(shape.stroke ?? { pattern: "straight", widthPt: 2 }), widthPt } })}
            />
          ),
        },
        {
          label: "Shape fill",
          hint: "New rectangles, ellipses, polygons and stars start filled at this opacity.",
          control: (
            <span className="set-inline">
              <label className="set-check">
                <input
                  type="checkbox"
                  checked={!!shape.fill}
                  onChange={(e) =>
                    e.target.checked
                      ? setShape({ fill: { opacityPct: 25 } })
                      : set((p) => {
                          const { fill: _removed, ...rest } = p.markDefaults.shape;
                          return { ...p, markDefaults: { ...p.markDefaults, shape: rest } };
                        })
                  }
                />
                Filled
              </label>
              {shape.fill && (
                <NumberField value={shape.fill.opacityPct} min={0} max={100} step={5} unit="%" onChange={(opacityPct) => setShape({ fill: { opacityPct } })} />
              )}
            </span>
          ),
        },
        {
          label: "Highlight color",
          control: (
            <span className="set-color">
              <input type="color" value={shape.highlightColor ?? "#FFE14D"} onChange={(e) => setShape({ highlightColor: e.target.value })} />
              {shape.highlightColor ?? "#FFE14D"}
            </span>
          ),
        },
        {
          label: "Outline",
          hint: "A halo under new lines, captions, shapes and notes, so they read over the script text. Highlights never get one.",
          control: (
            <span className="set-inline">
              <label className="set-check">
                <input type="checkbox" checked={!!outline} onChange={(e) => setOutline(e.target.checked ? { ...(outline ?? DEFAULT_OUTLINE) } : undefined)} />
                On
              </label>
              {outline && (
                <>
                  <span className="set-color">
                    <input type="color" value={outline.color} onChange={(e) => setOutline({ ...outline, color: e.target.value })} />
                    {outline.color}
                  </span>
                  <NumberField value={outline.widthPt} min={0.25} max={6} step={0.25} unit="len" onChange={(widthPt) => setOutline({ ...outline, widthPt })} />
                </>
              )}
            </span>
          ),
        },
        {
          label: "Reset",
          control: (
            <button
              type="button"
              className="dialog-btn"
              onClick={() => {
                const d = defaultSettings().markDefaults;
                set((p) => ({ ...p, markDefaults: { ...p.markDefaults, line: d.line, text: d.text, shape: d.shape } }));
              }}
            >
              Reset mark defaults
            </button>
          ),
        },
      ],
    },
    {
      id: "script-drawing",
      group: "Project",
      title: "Script & drawing",
      icon: <BookOpen {...icon} />,
      rows: [
        {
          label: "Book spread",
          hint: "Page 1 sits by itself, like a title page. Only book spread uses this.",
          control: (
            <label className="set-check">
              <input
                type="checkbox"
                checked={s.drawing.firstPageAlone}
                onChange={(e) => setDrawing({ firstPageAlone: e.target.checked })}
              />
              First page alone
            </label>
          ),
        },
        {
          label: "Snap angle step",
          hint: "With Snap on, lines, edges and rotation snap to this many degrees. 0 turns Snap off; Shift snaps at 15° when Snap is off.",
          control: <NumberField value={s.drawing.angleSnapDegrees} min={0} max={90} unit="°" onChange={(angleSnapDegrees) => setDrawing({ angleSnapDegrees })} />,
        },
      ],
    },
    {
      id: "appearance",
      group: "Preferences",
      title: "Appearance",
      icon: <Palette {...icon} />,
      rows: [
        {
          label: "Theme",
          control: (
            <Segmented<ColorTheme>
              value={prefs.colorTheme}
              options={[
                { value: "dark", label: "Dark" },
                { value: "system", label: "System" },
                { value: "light", label: "Light" },
              ]}
              onChange={prefs.setColorTheme}
            />
          ),
        },
        {
          label: "Units for sizes",
          hint: "Thickness, outlines, offsets and shape and image sizes. Font sizes stay in points.",
          control: (
            <select value={prefs.lengthUnit} onChange={(e) => prefs.setLengthUnit(e.target.value as LengthUnit)}>
              <option value="pt">Points (pt)</option>
              <option value="in">Inches (in)</option>
              <option value="mm">Millimeters (mm)</option>
            </select>
          ),
        },
        {
          label: "UI scale",
          hint: "Size of menus, panels and forms. The script page has its own zoom.",
          control: (
            <Segmented<UiScale>
              value={prefs.uiScale}
              options={UI_SCALES.map((scale) => ({ value: scale, label: `${scale}%` }))}
              onChange={prefs.setUiScale}
            />
          ),
        },
        {
          label: "Side panel order",
          control: (
            <Segmented
              value={prefs.panels.swapSides ? "scenes" : "properties"}
              options={[
                { value: "properties", label: "Properties left" },
                { value: "scenes", label: "Scenes left" },
              ]}
              onChange={(left) => prefs.setSwapSides(left === "scenes")}
            />
          ),
        },
        {
          label: "Floating action bar",
          hint: "Color, copy, paste, link, duplicate, split, lock and delete beside the selected mark.",
          control: (
            <input
              type="checkbox"
              checked={prefs.showActionBar}
              onChange={(e) => prefs.setShowActionBar(e.target.checked)}
            />
          ),
        },
        {
          label: "Action bar swatches",
          hint: "Where the preset colors open when you click the bar's color. Below suits systems (such as macOS) whose color picker opens above.",
          control: (
            <select value={prefs.actionBarSwatches} onChange={(e) => prefs.setActionBarSwatches(e.target.value as "above" | "below")}>
              <option value="above">Above the bar</option>
              <option value="below">Below the bar</option>
            </select>
          ),
        },
        {
          label: "Panel sizes",
          control: (
            <button type="button" className="dialog-btn" onClick={prefs.resetPanelWidths}>
              Reset panel sizes
            </button>
          ),
        },
      ],
    },
    {
      id: "interaction",
      group: "Preferences",
      title: "Interaction",
      icon: <MousePointer2 {...icon} />,
      rows: [
        {
          label: "Fingers on the script",
          hint: "With a touch screen. Auto: fingers draw until you use a pen, then they scroll and the pen draws. Two fingers always pinch to zoom and scroll; holding a finger still opens the right-click menu.",
          control: (
            <select value={prefs.touchFingers} onChange={(e) => prefs.setTouchFingers(e.target.value as "auto" | "draw" | "pan")}>
              <option value="auto">Auto (scroll once a pen is used)</option>
              <option value="draw">Draw and select</option>
              <option value="pan">Scroll (tap to select)</option>
            </select>
          ),
        },
        {
          label: "Click distance",
          hint: "How close a click has to be to a line, shape or pen stroke to select it.",
          control: (
            <NumberField value={prefs.lineHitTolerancePx} min={MIN_LINE_HIT_TOLERANCE_PX} max={MAX_LINE_HIT_TOLERANCE_PX} unit="px" onChange={prefs.setLineHitTolerancePx} />
          ),
        },
        {
          label: "Delete asks first",
          hint: "Ask before deleting scenes, shots and a shot's lines. Undo brings them back either way.",
          control: <input type="checkbox" checked={prefs.confirmDeletes} onChange={(e) => prefs.setConfirmDeletes(e.target.checked)} />,
        },
      ],
    },
    {
      id: "performance",
      group: "Preferences",
      title: "Performance",
      icon: <Gauge {...icon} />,
      rows: [
        {
          label: "Pages kept loaded",
          hint: "In Continuous scroll. More pages scroll more smoothly but use more memory.",
          control: (
            <NumberField value={prefs.maxMountedPdfPages} min={MIN_MAX_MOUNTED_PDF_PAGES} max={MAX_MAX_MOUNTED_PDF_PAGES} onChange={prefs.setMaxMountedPdfPages} />
          ),
        },
      ],
    },
    {
      id: "shortcuts",
      group: "Preferences",
      title: "Shortcuts",
      icon: <Keyboard {...icon} />,
      rows: [
        { label: "Tool keys", stacked: true, control: <ToolKeybindSettings /> },
        {
          label: "Mouse and drawing",
          stacked: true,
          control: (
            <dl className="set-shortcuts">
              {GESTURES.map(([name, keys]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>{keys}</dd>
                </div>
              ))}
            </dl>
          ),
        },
        {
          label: "Fixed shortcuts",
          stacked: true,
          control: (
            <dl className="set-shortcuts">
              {FIXED_SHORTCUTS.map(([name, keys]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>{keys}</dd>
                </div>
              ))}
            </dl>
          ),
        },
      ],
    },
    {
      id: "about",
      group: "Preferences",
      title: "About",
      icon: <Info {...icon} />,
      rows: [
        {
          label: "Shooting Script Liner",
          control: (
            <span className="set-about">
              <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={40} height={40} />
              <span>Version {APP_VERSION}</span>
            </span>
          ),
        },
        {
          label: "License",
          hint: "Use it, share it and change it freely, as the MIT license says.",
          control: (
            <span>
              Free and open source under the{" "}
              <a href={LICENSE_URL} target="_blank" rel="noopener noreferrer">
                MIT license
              </a>
              .
            </span>
          ),
        },
        {
          label: "Source code",
          hint: "Report problems, suggest features or read the code.",
          control: (
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
              github.com/phomenfx/ShootingScriptLiner
            </a>
          ),
        },
        {
          label: "Icons",
          control: (
            <span>
              From{" "}
              <a href="https://lucide.dev" target="_blank" rel="noopener noreferrer">
                Lucide
              </a>{" "}
              (ISC license), including the app icon.
            </span>
          ),
        },
      ],
    },
  ];

  const needle = query.trim().toLowerCase();
  const shown = sections
    .map((section) => ({
      ...section,
      rows:
        !needle || section.title.toLowerCase().includes(needle)
          ? section.rows
          : section.rows.filter((row) => `${row.label} ${row.hint ?? ""}`.toLowerCase().includes(needle)),
    }))
    .filter((section) => section.rows.length > 0);

  const jumpTo = (id: string) => {
    setActive(id);
    scroller.current?.querySelector(`#settings-${id}`)?.scrollIntoView({ block: "start" });
  };

  // Opened at a section (the ? key opens Shortcuts).
  const openSection = useSessionStore((s) => s.settingsSection);
  useEffect(() => {
    if (!open || !openSection) return;
    const frame = requestAnimationFrame(() => {
      setQuery("");
      jumpTo(openSection);
      useSessionStore.setState({ settingsSection: null });
    });
    return () => cancelAnimationFrame(frame);
  });

  /** The list on the left follows whichever section is at the top of the page. */
  const onScroll = () => {
    const box = scroller.current;
    if (!box) return;
    const top = box.getBoundingClientRect().top + 24;
    let current = shown[0]?.id ?? active;
    for (const section of shown) {
      const el = box.querySelector(`#settings-${section.id}`);
      if (el && el.getBoundingClientRect().top <= top) current = section.id;
    }
    if (current !== active) setActive(current);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-card settings" aria-describedby={undefined}>
          <header className="settings-head">
            <Dialog.Title className="settings-title">Settings</Dialog.Title>
            <label className="settings-search">
              <Search size={14} strokeWidth={1.75} />
              <input type="search" placeholder="Search settings" aria-label="Search settings" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <Dialog.Close className="panel-icon-btn" aria-label="Close settings" title="Close">
              <X size={16} strokeWidth={1.75} />
            </Dialog.Close>
          </header>
          <div className="settings-body">
            <nav className="settings-nav" aria-label="Settings sections">
              {(["Project", "Preferences"] as const).map((group) => (
                <div key={group}>
                  <p className="settings-nav-group">
                    {group}
                    <span>{group === "Project" ? "Saved in the project file" : "Saved in this browser"}</span>
                  </p>
                  {sections
                    .filter((section) => section.group === group)
                    .map((section) => (
                      <button
                        key={section.id}
                        type="button"
                        className={section.id === active ? "on" : undefined}
                        disabled={!shown.some((sh) => sh.id === section.id)}
                        onClick={() => jumpTo(section.id)}
                      >
                        {section.icon}
                        {section.title}
                      </button>
                    ))}
                </div>
              ))}
            </nav>
            <div className="settings-page" ref={scroller} onScroll={onScroll}>
              {shown.length === 0 && <p className="settings-empty">No settings match "{query}".</p>}
              {shown.map((section) => (
                <section key={section.id} id={`settings-${section.id}`} className="settings-section-block">
                  <h3>
                    {section.title} <span>{section.group}</span>
                  </h3>
                  {section.rows.map((row) => (
                    <div className={`set-row${row.stacked ? " set-row-stacked" : ""}`} key={row.label}>
                      <span className="set-label" title={row.hint}>
                        {row.label}
                      </span>
                      <div className="set-control">{row.control}</div>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
