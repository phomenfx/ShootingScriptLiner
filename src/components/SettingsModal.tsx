import { useEffect, useState } from "react";
import { getFontOptions, loadBundledFonts } from "../lib/fonts";
import { CAP_OPTIONS } from "../lib/lineCaps";
import { STROKE_OPTIONS } from "../lib/lineStrokes";
import { useProjectStore } from "../stores/projectStore";
import type { AdditionalInfoStyle, LabelMode } from "../types/project";
import type { LineCap, LineEnding, LineStroke } from "../types/annotations";
import { capSupportsFill } from "../types/annotations";
import { ToolKeybindSettings } from "./ToolKeybindSettings";
import {
  MAX_LINE_HIT_TOLERANCE_PX,
  MIN_LINE_HIT_TOLERANCE_PX,
} from "../types/appPreferences";
import { MAX_LABEL_OFFSET_PT, MIN_LABEL_OFFSET_PT } from "../types/labelLayout";

function DefaultEndingFields({
  label,
  ending,
  onChange,
}: {
  label: string;
  ending: LineEnding;
  onChange: (e: LineEnding) => void;
}) {
  const showFill = capSupportsFill(ending.cap);
  return (
    <fieldset className="settings-ending">
      <legend>{label}</legend>
      <label className="field">
        Style
        <select
          value={ending.cap}
          onChange={(e) =>
            onChange({ ...ending, cap: e.target.value as LineCap })
          }
        >
          {CAP_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
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
        <label className="field-inline">
          <input
            type="checkbox"
            checked={ending.filled}
            onChange={(e) => onChange({ ...ending, filled: e.target.checked })}
          />
          Fill
        </label>
      )}
    </fieldset>
  );
}

export function SettingsModal() {
  const open = useProjectStore((s) => s.settingsOpen);
  const project = useProjectStore((s) => s.project);
  const setSettingsOpen = useProjectStore((s) => s.setSettingsOpen);
  const setProjectName = useProjectStore((s) => s.setProjectName);
  const setLabelMode = useProjectStore((s) => s.setLabelMode);
  const setAdditionalInfoStyle = useProjectStore((s) => s.setAdditionalInfoStyle);
  const setDefaultShotColor = useProjectStore((s) => s.setDefaultShotColor);
  const setSnapAngleDegrees = useProjectStore((s) => s.setSnapAngleDegrees);
  const setInheritLineFromPrevious = useProjectStore((s) => s.setInheritLineFromPrevious);
  const setDefaultLine = useProjectStore((s) => s.setDefaultLine);
  const setLabelOffsetXPt = useProjectStore((s) => s.setLabelOffsetXPt);
  const setLabelOffsetYPt = useProjectStore((s) => s.setLabelOffsetYPt);
  const setLabelSecondaryGapPt = useProjectStore((s) => s.setLabelSecondaryGapPt);
  const lineHitTolerancePx = useProjectStore((s) => s.lineHitTolerancePx);
  const setLineHitTolerancePx = useProjectStore((s) => s.setLineHitTolerancePx);

  const [fontOptions, setFontOptions] = useState(getFontOptions());

  useEffect(() => {
    if (open) void loadBundledFonts().then(() => setFontOptions(getFontOptions()));
  }, [open]);

  if (!open) return null;

  const d = project.defaultLine;

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true">
      <div className="dialog settings-dialog settings-dialog-wide">
        <h2>Settings</h2>
        <label className="field">
          Project name
          <input
            type="text"
            value={project.name}
            onChange={(e) => setProjectName(e.target.value)}
          />
        </label>
        <label className="field">
          Label mode
          <select
            value={project.labelMode}
            onChange={(e) => setLabelMode(e.target.value as LabelMode)}
          >
            <option value="letter">Letter (1A, 1B)</option>
            <option value="decimal">Decimal (1.1, 1.2)</option>
          </select>
        </label>
        <label className="field">
          Additional Info style
          <select
            value={project.additionalInfoStyle}
            onChange={(e) =>
              setAdditionalInfoStyle(e.target.value as AdditionalInfoStyle)
            }
          >
            <option value="parens">In parentheses - Subject (Moving Master)</option>
            <option value="hyphen">Hyphen - Subject - Moving Master</option>
          </select>
        </label>
        <label className="field">
          Default shot color
          <input
            type="color"
            value={project.defaultShotColor}
            onChange={(e) => setDefaultShotColor(e.target.value)}
          />
        </label>

        <h3 className="settings-section">Default line properties</h3>
        <div className="settings-grid">
          <label className="field">
            Font
            <select
              value={d.fontFamily}
              onChange={(e) => setDefaultLine({ fontFamily: e.target.value })}
            >
              {fontOptions.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Font size (pt)
            <input
              type="number"
              min={6}
              max={48}
              step={0.5}
              value={d.fontSizePt}
              onChange={(e) =>
                setDefaultLine({ fontSizePt: Number(e.target.value) || 11 })
              }
            />
          </label>
          <label className="field-inline span-2">
            <input
              type="checkbox"
              checked={d.labelBold}
              onChange={(e) => setDefaultLine({ labelBold: e.target.checked })}
            />
            Bold labels
          </label>
          <label className="field">
            Border style
            <select
              value={d.stroke}
              onChange={(e) =>
                setDefaultLine({ stroke: e.target.value as LineStroke })
              }
            >
              {STROKE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Width (pt)
            <input
              type="number"
              min={0.25}
              max={24}
              step={0.25}
              value={d.widthPt}
              onChange={(e) =>
                setDefaultLine({ widthPt: Number(e.target.value) || 2 })
              }
            />
          </label>
        </div>
        <div className="settings-endings">
          <DefaultEndingFields
            label="Start"
            ending={d.start}
            onChange={(start) => setDefaultLine({ start })}
          />
          <DefaultEndingFields
            label="End"
            ending={d.end}
            onChange={(end) => setDefaultLine({ end })}
          />
        </div>

        <label className="field">
          Angle snap (degrees)
          <input
            type="number"
            min={0}
            max={90}
            step={1}
            value={project.snapAngleDegrees}
            onChange={(e) => setSnapAngleDegrees(Number(e.target.value) || 0)}
          />
        </label>
        <p className="settings-hint settings-hint-tight">
          0 = off. Hold <kbd>Shift</kbd> while drawing to snap temporarily (uses 15° when off).
        </p>
        <label className="field-inline">
          <input
            type="checkbox"
            checked={project.inheritLineFromPrevious}
            onChange={(e) => setInheritLineFromPrevious(e.target.checked)}
          />
          Inherit from previous line (font, stroke, width, endings, bold)
        </label>

        <h3 className="settings-section">Script labels</h3>
        <p className="settings-hint settings-hint-tight">
          Label position on the script and in exported PDFs. Bold is set per line or text in
          properties, or as the default above.
        </p>
        <div className="settings-grid">
          <label className="field">
            Offset X (pt)
            <input
              type="number"
              min={MIN_LABEL_OFFSET_PT}
              max={MAX_LABEL_OFFSET_PT}
              step={0.5}
              value={project.labelOffsetXPt}
              onChange={(e) => setLabelOffsetXPt(Number(e.target.value))}
            />
          </label>
          <label className="field">
            Offset Y (pt)
            <input
              type="number"
              min={MIN_LABEL_OFFSET_PT}
              max={MAX_LABEL_OFFSET_PT}
              step={0.5}
              value={project.labelOffsetYPt}
              onChange={(e) => setLabelOffsetYPt(Number(e.target.value))}
            />
          </label>
          <label className="field">
            Secondary gap (pt)
            <input
              type="number"
              min={MIN_LABEL_OFFSET_PT}
              max={MAX_LABEL_OFFSET_PT}
              step={0.5}
              value={project.labelSecondaryGapPt}
              onChange={(e) => setLabelSecondaryGapPt(Number(e.target.value))}
            />
          </label>
        </div>
        <p className="settings-hint settings-hint-tight">
          Offset Y moves the label above the line start. Secondary gap is space below the arrow for
          “(cont.)” labels.
        </p>

        <h3 className="settings-section">Tool shortcuts</h3>
        <ToolKeybindSettings />

        <h3 className="settings-section">Script interaction</h3>
        <label className="field">
          Line click margin (px)
          <input
            type="number"
            min={MIN_LINE_HIT_TOLERANCE_PX}
            max={MAX_LINE_HIT_TOLERANCE_PX}
            step={1}
            value={lineHitTolerancePx}
            onChange={(e) => setLineHitTolerancePx(Number(e.target.value))}
          />
        </label>
        <p className="settings-hint settings-hint-tight">
          How close to a line you can click to select it (Select tool).
        </p>

        <p className="settings-hint">
          Script fonts are bundled TTFs in <code>public/fonts/</code> — see README there.
        </p>

        <div className="dialog-actions">
          <button type="button" onClick={() => setSettingsOpen(false)}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
