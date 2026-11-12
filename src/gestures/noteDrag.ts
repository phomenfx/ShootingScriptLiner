import {
  ASCENT_EM,
  clampBoxHeightPt,
  clampBoxWidthPt,
  measureViewerText,
  resizeTextBox,
  viewerFontShorthand,
  type BoxHandle,
  type TextFrame,
} from "../lib/textBox";
import type { TextAnnotation } from "../types/annotations";

export type PageSpace = { w: number; h: number; scale: number };

/** Where a note lands after its box is dragged. */
export function noteMovePatch(startFrame: TextFrame, dx: number, dy: number, page: PageSpace): { x: number; y: number } {
  const left = startFrame.left + dx;
  const baseline = startFrame.top + dy + startFrame.fontSize * ASCENT_EM;
  return { x: left / page.w, y: baseline / page.h };
}

/** Where a note lands after one of its box handles is dragged. */
export function noteResizePatch(
  note: TextAnnotation,
  startFrame: TextFrame,
  handle: BoxHandle,
  dx: number,
  dy: number,
  page: PageSpace,
  text: string,
  bold: boolean,
  italic: boolean,
  family: string
): Partial<TextAnnotation> {
  const resized = resizeTextBox(startFrame, handle, dx, dy, text, note.align ?? "left", (sample) =>
    measureViewerText(sample, viewerFontShorthand(family, startFrame.fontSize, bold, italic))
  );
  const baseline = resized.top + startFrame.fontSize * ASCENT_EM;
  return {
    x: resized.left / page.w,
    y: baseline / page.h,
    ...(resized.widthChanged ? { widthPt: clampBoxWidthPt(resized.width / page.scale) } : {}),
    ...(resized.heightChanged
      ? {
          minHeightPt: resized.minHeight != null ? clampBoxHeightPt(resized.minHeight / page.scale) : undefined,
        }
      : {}),
  };
}
