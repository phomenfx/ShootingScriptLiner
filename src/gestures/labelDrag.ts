import {
  clampBoxHeightPt,
  clampBoxWidthPt,
  primaryOffsetFromPlacement,
  resizeTextBox,
  secondaryOffsetFromPlacement,
  type BoxHandle,
  type TextFrame,
} from "../lib/textBox";
import type { TextAlign } from "../types/annotations";

type Measure = (sample: string) => number;

export type LabelDrag = {
  which: "primary" | "secondary";
  resizing: boolean;
  handle: BoxHandle | null;
  startFrame: TextFrame;
  anchor: { x: number; y: number };
  dx: number;
  dy: number;
  sampleText: string;
  align: TextAlign;
  scale: number;
  measure: Measure;
};

/** Caption offset (and size, when a handle is dragged) after a label gesture. */
export function labelDragPatch(drag: LabelDrag): Record<string, number | undefined> {
  const moved = drag.resizing
    ? resizeTextBox(
        drag.startFrame,
        drag.handle ?? "e",
        drag.dx,
        drag.dy,
        drag.sampleText,
        drag.align,
        drag.measure
      )
    : {
        left: drag.startFrame.left + drag.dx,
        top: drag.startFrame.top + drag.dy,
        width: drag.startFrame.width,
        height: drag.startFrame.height,
        minHeight: undefined as number | undefined,
        widthChanged: false,
        heightChanged: false,
      };
  const frame: TextFrame = {
    ...drag.startFrame,
    left: moved.left,
    top: moved.top,
    width: moved.width,
    height: moved.height,
  };
  if (drag.which === "primary") {
    return {
      ...primaryOffsetFromPlacement(drag.anchor, frame, drag.align, drag.scale),
      ...(moved.widthChanged ? { labelWidthPt: clampBoxWidthPt(moved.width / drag.scale) } : {}),
      ...(moved.heightChanged
        ? { labelMinHeightPt: moved.minHeight != null ? clampBoxHeightPt(moved.minHeight / drag.scale) : undefined }
        : {}),
    };
  }
  return {
    ...secondaryOffsetFromPlacement(drag.anchor, frame, drag.align, drag.startFrame.fontSize, drag.scale),
    ...(moved.widthChanged ? { secondaryWidthPt: clampBoxWidthPt(moved.width / drag.scale) } : {}),
    ...(moved.heightChanged
      ? {
          secondaryMinHeightPt:
            moved.minHeight != null ? clampBoxHeightPt(moved.minHeight / drag.scale) : undefined,
        }
      : {}),
  };
}
