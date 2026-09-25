import type { TextAlign } from "../../types/annotations";

const ALIGNS: { id: TextAlign; label: string }[] = [
  { id: "left", label: "Left" },
  { id: "center", label: "Center" },
  { id: "right", label: "Right" },
];

type FontOption = { value: string; label: string };

type Props = {
  fontOptions: FontOption[];
  fontFamily: string;
  onFontFamily: (fontFamily: string) => void;
  align: TextAlign;
  onAlign: (align: TextAlign) => void;
  fontSize: number;
  onFontSize: (size: number) => void;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  onBold: (value: boolean) => void;
  onItalic: (value: boolean) => void;
  onUnderline: (value: boolean) => void;
  enabled: boolean;
  onEnabled: (value: boolean) => void;
  secondaryAlign?: TextAlign;
  onSecondaryAlign?: (align: TextAlign) => void;
  showResetOffset?: boolean;
  onResetOffset?: () => void;
};

function AlignButtons({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TextAlign;
  onChange: (align: TextAlign) => void;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {ALIGNS.map((align) => (
        <button
          key={align.id}
          type="button"
          className={value === align.id ? "active" : ""}
          aria-pressed={value === align.id}
          onClick={() => onChange(align.id)}
        >
          {align.label}
        </button>
      ))}
    </div>
  );
}

export function CaptionFormatFields({
  fontOptions,
  fontFamily,
  onFontFamily,
  align,
  onAlign,
  fontSize,
  onFontSize,
  bold,
  italic,
  underline,
  onBold,
  onItalic,
  onUnderline,
  enabled,
  onEnabled,
  secondaryAlign,
  onSecondaryAlign,
  showResetOffset,
  onResetOffset,
}: Props) {
  return (
    <div className="caption-format">
      <div className="caption-font-row">
        <label className="field compact">
          Font
          <select value={fontFamily} onChange={(e) => onFontFamily(e.target.value)}>
            {fontOptions.map((font) => (
              <option key={font.value} value={font.value}>
                {font.label}
              </option>
            ))}
          </select>
        </label>
        <AlignButtons label="Align" value={align} onChange={onAlign} />
      </div>
      <div className="caption-size-row">
        <label className="field compact">
          Size (pt)
          <input
            type="number"
            min={6}
            max={48}
            step={0.5}
            value={fontSize}
            onChange={(e) => onFontSize(Math.max(6, Number(e.target.value) || 11))}
          />
        </label>
        <div className="segmented" role="group" aria-label="Style">
          <button
            type="button"
            className={`style-bold ${bold ? "active" : ""}`}
            aria-pressed={bold}
            onClick={() => onBold(!bold)}
          >
            B
          </button>
          <button
            type="button"
            className={`style-italic ${italic ? "active" : ""}`}
            aria-pressed={italic}
            onClick={() => onItalic(!italic)}
          >
            I
          </button>
          <button
            type="button"
            className={`style-underline ${underline ? "active" : ""}`}
            aria-pressed={underline}
            onClick={() => onUnderline(!underline)}
          >
            U
          </button>
        </div>
      </div>
      <label className="field-inline compact caption-enable">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onEnabled(e.target.checked)}
        />
        Enable Text
      </label>
      {secondaryAlign && onSecondaryAlign && (
        <div className="caption-font-row">
          <span className="caption-cont-label">Cont.</span>
          <AlignButtons label="Cont. align" value={secondaryAlign} onChange={onSecondaryAlign} />
        </div>
      )}
      {showResetOffset && onResetOffset && (
        <button type="button" className="caption-reset" onClick={onResetOffset}>
          Use project label offset
        </button>
      )}
    </div>
  );
}
