import type { Annotation } from "./annotations";
import { DEFAULT_LABEL_LAYOUT } from "./labelLayout";
import { DEFAULT_LINE_DEFAULTS, type LineDefaults } from "./lineDefaults";

export type { Annotation, ScriptTool } from "./annotations";
export type { LabelLayout } from "./labelLayout";
export type { LineDefaults } from "./lineDefaults";

export type LabelMode = "letter" | "decimal";

/** How Additional Info appears after the Label in shot names */
export type AdditionalInfoStyle = "parens" | "hyphen";

export type Shot = {
  id: string;
  order: number;
  shotType?: string;
  subject?: string;
  slug?: string;
  color: string;
  visible: boolean;
  notes?: string;
};

export type Scene = {
  id: string;
  slugline: string;
  order: number;
  visible: boolean;
  shots: Shot[];
};

export type Project = {
  version: 1;
  name: string;
  labelMode: LabelMode;
  additionalInfoStyle: AdditionalInfoStyle;
  defaultShotColor: string;
  /** 0 = off; hold Shift to snap temporarily. Otherwise snap within N degrees of H/V. */
  snapAngleDegrees: number;
  inheritLineFromPrevious: boolean;
  /** Label position offsets (viewer + PDF export). */
  labelOffsetXPt: number;
  labelOffsetYPt: number;
  labelSecondaryGapPt: number;
  defaultLine: LineDefaults;
  scriptFileName?: string;
  scenes: Scene[];
  annotations: Annotation[];
};

export const DEFAULT_PROJECT: Project = {
  version: 1,
  name: "Untitled",
  labelMode: "letter",
  additionalInfoStyle: "parens",
  defaultShotColor: "#FF0000",
  snapAngleDegrees: 15,
  inheritLineFromPrevious: false,
  ...DEFAULT_LABEL_LAYOUT,
  defaultLine: { ...DEFAULT_LINE_DEFAULTS },
  scenes: [],
  annotations: [],
};
