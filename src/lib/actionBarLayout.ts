export type Bounds = { left: number; top: number; right: number; bottom: number };

/** Room the bar needs, including its move handle. */
export const ACTION_BAR_WIDTH = 296;
export const ACTION_BAR_HEIGHT = 32;

/** Places the action bar to the right of a mark, flipping inside the page when it would hang off. */
export function actionBarPosition(
  bounds: Bounds,
  pageWidth: number,
  pageHeight: number,
  barWidth = ACTION_BAR_WIDTH,
  barHeight = ACTION_BAR_HEIGHT
): { left: number; top: number } {
  let left = bounds.right + 8;
  let top = bounds.top;
  if (left + barWidth > pageWidth - 4) left = bounds.left - barWidth - 8;
  if (left < 4) left = Math.max(4, Math.min(bounds.left, pageWidth - barWidth - 4));
  if (top + barHeight > pageHeight - 4) top = Math.max(4, pageHeight - barHeight - 4);
  if (top < 4) top = 4;
  return { left, top };
}

/** Automatic spot plus the amount the user dragged the bar, kept on the page. */
export function shiftActionBar(
  anchor: { left: number; top: number },
  offset: { x: number; y: number },
  pageWidth: number,
  pageHeight: number,
  barWidth = ACTION_BAR_WIDTH,
  barHeight = ACTION_BAR_HEIGHT
): { left: number; top: number } {
  const maxLeft = Math.max(4, pageWidth - barWidth - 4);
  const maxTop = Math.max(4, pageHeight - barHeight - 4);
  return {
    left: Math.min(maxLeft, Math.max(4, anchor.left + offset.x)),
    top: Math.min(maxTop, Math.max(4, anchor.top + offset.y)),
  };
}
