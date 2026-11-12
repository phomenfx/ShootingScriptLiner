import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  FileText,
  Keyboard,
  List,
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
import { CAPTION_FIELDS, choiceEntries, isCaptionFieldId } from "../../model/registry";
import type { CaptionDivider, Ending, LineDefaults, ProjectSettings, WaveSide } from "../../model/types";
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
const DRAWABLE_ENDINGS = ["none", "square", "circle", "diamond", "arrow", "arrowReversed", "butt", "slash"];
const FILLABLE_ENDINGS = ["square", "circle", "diamond", "arrow", "arrowReversed"];

const DATE_CODES =
  "m 1–12 · mm 01–12 · mmm Jan · mmmm January\nd 1–31 · dd 01–31 · ddd Sun · dddd Sunday\nyy 00–99 · yyyy 1900–9999";

const FIXED_SHORTCUTS: [string, string][] = [
  ["Save", "Ctrl+S"],
  ["Open", "Ctrl+O"],
  ["Export lined PDF", "Ctrl+E"],
  ["Undo", "Ctrl+Z"],
  ["Redo", "Ctrl+Shift+Z"],
  ["Cut / Copy / Paste", "Ctrl+X / C / V"],
  ["Paste in place", "Ctrl+Shift+V"],
  ["Duplicate", "Ctrl+D"],
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

function NumberField({
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

function EndingField({ value, onChange }: { value: Ending; onChange: (value: Ending) => void }) {
  const entries = choiceEntries("ending", undefined).filter((e) => DRAWABLE_ENDINGS.includes(e.key));
  const fillable = FILLABLE_ENDINGS.includes(value.type);
  return (
    <span className="set-inline">
      <select value={value.type} onChange={(e) => onChange({ ...value, type: e.target.value })}>
        {entries.map((entry) => (
          <option key={entry.key} value={entry.key}>
            {entry.label}
          </option>
        ))}
      </select>
      <NumberField value={value.sizePct} min={50} step={10} unit="%" onChange={(sizePct) => onChange({ ...value, sizePct })} />
      <label className="set-check">
        <input
          type="checkbox"
          checked={fillable && value.filled}
          disabled={!fillable}
          onChange={(e) => onChange({ ...value, filled: e.target.checked })}
        />
        Filled
      </label>
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
  /** Captions and notes share one text style for now, as they always have. */
  const setLineText = (patch: Partial<LineDefaults["caption"]>) =>
    set((p) => ({
      ...p,
      markDefaults: {
        ...p.markDefaults,
        line: { ...p.markDefaults.line, caption: { ...p.markDefaults.line.caption, ...patch } },
        text: { ...p.markDefaults.text, style: { ...p.markDefaults.text.style, ...patch } },
      },
    }));

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
          label: "Shot IDs",
          control: (
            <Segmented
              value={s.general.shotIdStyle}
              options={[
                { value: "letter", label: "Letters · 1A, 1B" },
                { value: "decimal", label: "Numbers · 1.1, 1.2" },
              ]}
              onChange={(shotIdStyle) => setGeneral({ shotIdStyle })}
            />
          ),
        },
        {
          label: "Additional info style",
          control: (
            <Segmented
              value={s.general.additionalInfoStyle}
              options={[
                { value: "parens", label: "Subject (Moving)" },
                { value: "hyphen", label: "Subject - Moving" },
              ]}
              onChange={(additionalInfoStyle) => setGeneral({ additionalInfoStyle })}
            />
          ),
        },
        {
          label: "New shot color",
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
      id: "captions",
      group: "Project",
      title: "Captions",
      icon: <List {...icon} />,
      rows: [
        { label: "Preview", control: <span className="set-preview set-preview-mono">{captionPreview}</span> },
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
          hint: "How far a caption starts to the right of its line's first point.",
          control: <NumberField value={s.captions.offsetAcrossPt} min={0} max={48} unit="pt" onChange={(offsetAcrossPt) => setCaptions({ offsetAcrossPt })} />,
        },
        {
          label: "Offset above line",
          control: <NumberField value={s.captions.offsetAbovePt} min={0} max={48} unit="pt" onChange={(offsetAbovePt) => setCaptions({ offsetAbovePt })} />,
        },
        {
          label: '"(cont.)" gap',
          hint: "Space between the end of a continued line and its (cont.) caption.",
          control: <NumberField value={s.captions.contGapPt} min={0} max={48} unit="pt" onChange={(contGapPt) => setCaptions({ contGapPt })} />,
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
          control: <NumberField value={line.stroke.widthPt} min={0.25} max={24} step={0.25} unit="pt" onChange={(widthPt) => setLine({ stroke: { ...line.stroke, widthPt } })} />,
        },
        ...patternFields(line.stroke.pattern).map((field) => strokeTuneRow(line.stroke, field, (stroke) => setLine({ stroke }))),
        { label: "Line start", control: <EndingField value={line.start} onChange={(start) => setLine({ start })} /> },
        { label: "Line end", control: <EndingField value={line.end} onChange={(end) => setLine({ end })} /> },
        {
          label: "Caption and note font",
          control: (
            <span className="set-inline">
              <select value={line.caption.font} onChange={(e) => setLineText({ font: e.target.value })}>
                {!fonts.some((font) => font.value === line.caption.font) && <option value={line.caption.font}>{line.caption.font}</option>}
                {fonts.map((font) => (
                  <option key={font.value} value={font.value}>
                    {font.label}
                  </option>
                ))}
              </select>
              <NumberField value={line.caption.sizePt} min={4} max={96} unit="pt" onChange={(sizePt) => setLineText({ sizePt })} />
              <label className="set-check">
                <input type="checkbox" checked={line.caption.bold} onChange={(e) => setLineText({ bold: e.target.checked })} />
                Bold
              </label>
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
                set((p) => ({ ...p, markDefaults: { ...p.markDefaults, line: d.line, text: d.text } }));
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
          label: "Angle snap",
          hint: "A line within this many degrees of straight up or across snaps to it. 0 is off; holding Shift snaps at 15°.",
          control: <NumberField value={s.drawing.angleSnapDegrees} min={0} max={90} unit="°" onChange={(angleSnapDegrees) => setDrawing({ angleSnapDegrees })} />,
        },
        {
          label: "New lines copy the last line",
          hint: "A new line takes the style of the line drawn before it instead of the mark defaults.",
          control: (
            <input type="checkbox" checked={s.drawing.newLineCopiesPrevious} onChange={(e) => setDrawing({ newLineCopiesPrevious: e.target.checked })} />
          ),
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
          hint: "Duplicate, link and delete beside the selected mark.",
          control: (
            <input
              type="checkbox"
              checked={prefs.showActionBar}
              onChange={(e) => prefs.setShowActionBar(e.target.checked)}
            />
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
          label: "Line click margin",
          hint: "How close to a line a click has to be to select it.",
          control: (
            <NumberField value={prefs.lineHitTolerancePx} min={MIN_LINE_HIT_TOLERANCE_PX} max={MAX_LINE_HIT_TOLERANCE_PX} unit="px" onChange={prefs.setLineHitTolerancePx} />
          ),
        },
        {
          label: "Scroll view: pages kept loaded",
          hint: "More pages scroll more smoothly but use more memory.",
          control: (
            <NumberField value={prefs.maxMountedPdfPages} min={MIN_MAX_MOUNTED_PDF_PAGES} max={MAX_MAX_MOUNTED_PDF_PAGES} onChange={prefs.setMaxMountedPdfPages} />
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
      id: "shortcuts",
      group: "Preferences",
      title: "Shortcuts",
      icon: <Keyboard {...icon} />,
      rows: [
        { label: "Tool keys", stacked: true, control: <ToolKeybindSettings /> },
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
