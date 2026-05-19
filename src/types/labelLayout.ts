export const DEFAULT_LABEL_OFFSET_X_PT = 3;
export const DEFAULT_LABEL_OFFSET_Y_PT = 4;
export const DEFAULT_LABEL_SECONDARY_GAP_PT = 4;

export const MIN_LABEL_OFFSET_PT = 0;
export const MAX_LABEL_OFFSET_PT = 48;

export type LabelLayout = {
  labelOffsetXPt: number;
  labelOffsetYPt: number;
  labelSecondaryGapPt: number;
};

export const DEFAULT_LABEL_LAYOUT: LabelLayout = {
  labelOffsetXPt: DEFAULT_LABEL_OFFSET_X_PT,
  labelOffsetYPt: DEFAULT_LABEL_OFFSET_Y_PT,
  labelSecondaryGapPt: DEFAULT_LABEL_SECONDARY_GAP_PT,
};

export function clampLabelOffsetPt(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_LABEL_OFFSET_X_PT;
  return Math.max(MIN_LABEL_OFFSET_PT, Math.min(MAX_LABEL_OFFSET_PT, n));
}

export function migrateLabelLayout(raw: Partial<LabelLayout> | undefined): LabelLayout {
  return {
    labelOffsetXPt: clampLabelOffsetPt(raw?.labelOffsetXPt ?? DEFAULT_LABEL_OFFSET_X_PT),
    labelOffsetYPt: clampLabelOffsetPt(raw?.labelOffsetYPt ?? DEFAULT_LABEL_OFFSET_Y_PT),
    labelSecondaryGapPt: clampLabelOffsetPt(
      raw?.labelSecondaryGapPt ?? DEFAULT_LABEL_SECONDARY_GAP_PT
    ),
  };
}
