import type { Annotation } from "./annotations";
import { DEFAULT_LABEL_LAYOUT } from "./labelLayout";
import { DEFAULT_LINE_DEFAULTS, type LineDefaults } from "./lineDefaults";
import {
  DEFAULT_LINE_LABEL_FIELDS,
  DEFAULT_SCHEDULED_DATE_FORMAT,
  type LineLabelField,
  type LineLabelFieldId,
} from "./lineLabelFields";

export type { Annotation, ScriptTool } from "./annotations";
export type { LabelLayout } from "./labelLayout";
export type { LineDefaults } from "./lineDefaults";
export type { LineLabelField, LineLabelFieldId } from "./lineLabelFields";

export type LabelMode = "letter" | "decimal";

/** How Additional Info appears after the Label in shot names */
export type AdditionalInfoStyle = "parens" | "hyphen";

/** Blank on a shot means inherit the scene value. */
export const SYNC_STATUSES = ["SYNC", "MOS", "ADR/Foley"] as const;

export type Shot = {
  id: string;
  order: number;
  shotType?: string;
  subject?: string;
  slug?: string;
  color: string;
  visible: boolean;
  notes?: string;
  cameraSupport?: string;
  lens?: string;
  audioSource?: string;
  /** INT., EXT., INT./EXT. Blank inherits the scene. */
  indicator?: string;
  /** Blank inherits the scene location. */
  location?: string;
  /** DAY, NIGHT, LATER, … Blank inherits the scene. */
  timeOfDay?: string;
  /** Camera body or letter. Blank inherits the scene. */
  camera?: string;
  /** Blank inherits the scene. */
  fps?: string;
  /** SYNC, MOS, or ADR/Foley. Blank inherits the scene. */
  sync?: string;
  /** YYYY-MM-DD. Blank inherits the scene date. */
  scheduledDate?: string;
  /** Keys that differ from the project line-label defaults. */
  lineLabelInclude?: Partial<Record<LineLabelFieldId, boolean>>;
};

export type Scene = {
  id: string;
  slugline: string;
  order: number;
  visible: boolean;
  shots: Shot[];
  indicator?: string;
  location?: string;
  timeOfDay?: string;
  cameraSupport?: string;
  lens?: string;
  audioSource?: string;
  camera?: string;
  fps?: string;
  sync?: string;
  /** YYYY-MM-DD. */
  scheduledDate?: string;
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
  /** Order and default inclusion for script line text. */
  lineLabelFields: LineLabelField[];
  /** Excel date codes for line text and the lined PDF. */
  scheduledDateFormat: string;
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
  lineLabelFields: DEFAULT_LINE_LABEL_FIELDS.map((field) => ({ ...field })),
  scheduledDateFormat: DEFAULT_SCHEDULED_DATE_FORMAT,
  scenes: [],
  annotations: [],
};
