/*
 * "Set as default": a line, note or shape's style becomes the style new marks
 * of that kind start with.
 */
import type { Mark, ProjectSettings, TextStyle } from "./types";

const textStyleOf = (style: TextStyle): TextStyle => ({
  font: style.font,
  sizePt: style.sizePt,
  bold: style.bold,
  italic: style.italic,
  underline: style.underline,
  align: style.align,
});

/** Settings with the mark's style as the default for its kind. Images have no style, so nothing changes. */
export function markAsDefaults(settings: ProjectSettings, mark: Mark): ProjectSettings {
  const d = settings.markDefaults;
  if (mark.kind === "line") {
    const style = textStyleOf(mark.caption);
    const line = { ...d.line, stroke: { ...mark.stroke }, start: { ...mark.start }, end: { ...mark.end }, caption: style };
    if (mark.outline) line.outline = { ...mark.outline };
    else delete line.outline;
    if (mark.caption.outline) line.captionOutline = { ...mark.caption.outline };
    else delete line.captionOutline;
    // Captions and notes share one text style.
    return { ...settings, markDefaults: { ...d, line, text: { ...d.text, style } } };
  }
  if (mark.kind === "text") {
    const style = textStyleOf(mark.style);
    const text = { ...d.text, color: mark.color ?? d.text.color, style };
    if (mark.outline) text.outline = { ...mark.outline };
    else delete text.outline;
    return { ...settings, markDefaults: { ...d, text, line: { ...d.line, caption: style } } };
  }
  if (mark.kind === "shape") {
    // A highlight only sets the highlight color; the other shapes share one style.
    if (mark.shape === "highlight") {
      return { ...settings, markDefaults: { ...d, shape: { ...d.shape, highlightColor: mark.color ?? d.shape.highlightColor } } };
    }
    const shape = { ...d.shape };
    // Pen and polygon are their own tools, so they leave the Shape tool's shape alone.
    if (mark.shape !== "path") shape.shape = mark.shape;
    if (mark.stroke) shape.stroke = { ...mark.stroke };
    if (mark.fill) shape.fill = { opacityPct: mark.fill.opacityPct };
    else delete shape.fill;
    if (mark.outline) shape.outline = { ...mark.outline };
    else delete shape.outline;
    return { ...settings, markDefaults: { ...d, shape } };
  }
  return settings;
}
