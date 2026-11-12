/**
 * Project data, version 2. This is both the save format and what the stores hold.
 *
 * Rules:
 * - Every position and size is in PDF points from the top-left corner of the
 *   page as displayed (after page rotation). Y grows downward.
 * - A value is stored only when it overrides something. A missing value means "follow".
 * - Nothing that can be worked out is stored: list position is the order, shot IDs
 *   (1A, 1B) and sluglines are built on demand.
 * - Choice fields hold short keys (see `registry.ts`). Unknown keys are kept as they are.
 */

export const PROJECT_VERSION = 2;

export type Point = { x: number; y: number };

export type TextAlign = "left" | "center" | "right";

/** One page of the script as displayed. */
export type ScriptPage = { widthPt: number; heightPt: number; rotation: number };

/**
 * Which script PDF the marks were drawn on. `pageCount` 0 and an empty
 * fingerprint mean the PDF has not been seen yet (only its name is known).
 */
export type ScriptInfo = {
  fileName: string;
  pageCount: number;
  pages: ScriptPage[];
  /** SHA-256 of the PDF file, lowercase hex. */
  fingerprint: string;
};

/* ---------- Scenes and shots ---------- */

export type SceneHeading = { indicator: string; location: string; time: string };

export type CameraRow = { name: string; lenses: string[] };

/** Scene values that its shots inherit until they override them. */
export type SceneDefaults = {
  movement: string[];
  cameras: CameraRow[];
  audio: string[];
  fps?: string;
  sync?: string;
  /** YYYY-MM-DD */
  date?: string;
};

/**
 * Scene values a shot overrides. A field that is present is unlocked, even when
 * empty (an empty list means "deliberately none"). A missing field inherits.
 */
export type ShotOwn = {
  indicator?: string;
  location?: string;
  time?: string;
  movement?: string[];
  cameras?: CameraRow[];
  audio?: string[];
  fps?: string;
  sync?: string;
  date?: string;
};

export type ShotOwnField = keyof ShotOwn;

/**
 * Shot values a line or note replaces. A field that is present is unlocked,
 * even when empty. A missing field follows the shot.
 */
export type MarkOwn = {
  type?: string;
  angle?: string;
  subject?: string;
  cast?: string[];
  tags?: string[];
  additionalInfo?: string;
  notes?: string;
  setup?: string;
  indicator?: string;
  location?: string;
  time?: string;
  movement?: string[];
  cameras?: CameraRow[];
  audio?: string[];
  fps?: string;
  sync?: string;
  date?: string;
};

export type Shot = {
  id: string;
  color: string;
  visible: boolean;
  type?: string;
  angle?: string;
  subject?: string;
  cast?: string[];
  tags?: string[];
  additionalInfo?: string;
  /** Registry key: planned, shot, pickup, cut, or custom. */
  status: string;
  /** Registry key: must, nice, low, or custom. */
  priority: string;
  setup?: string;
  estimatedMinutes?: number;
  notes?: string;
  /** Per-shot print checkboxes that differ from the project caption settings. */
  print?: Record<string, boolean>;
  own?: ShotOwn;
};

export type Scene = {
  id: string;
  visible: boolean;
  heading: SceneHeading;
  defaults: SceneDefaults;
  shots: Shot[];
};

/* ---------- Marks ---------- */

export type Outline = { color: string; widthPt: number };

export type Ending = {
  /** Registry key: none, square, circle, diamond, arrow, … */
  type: string;
  /** 100 = normal. */
  sizePct: number;
  filled: boolean;
};

export type Stroke = {
  /** Registry key: straight, dotted, wavy, … */
  pattern: string;
  widthPt: number;
  /** 100 = normal. Missing means 100. */
  patternSizePct?: number;
};

export type TextStyle = {
  font: string;
  sizePt: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: TextAlign;
};

export type Caption = TextStyle & {
  show: boolean;
  /** Present only when the caption is Custom. Otherwise it is built from the shot. */
  text?: string;
  /** Present only when the caption was moved. Offset of its origin from the first point. */
  offset?: Point;
  /** Wrap width. Missing hugs the text on one line. */
  widthPt?: number;
  minHeightPt?: number;
  outline?: Outline;
};

/** Placement of the "(cont.)" caption. Every field falls back to the project setting. */
export type ContCaption = {
  offsetXPt?: number;
  gapPt?: number;
  widthPt?: number;
  minHeightPt?: number;
  align?: TextAlign;
};

export type MarginContinuation = "top" | "bottom";

type MarkBase = {
  id: string;
  /** 1-based page number. */
  page: number;
  /** Present only when the mark is linked to a shot. */
  shotId?: string;
};

export type LineMark = MarkBase & {
  kind: "line";
  /** Two or more points. */
  points: Point[];
  /** Present only when the line has its own color. Otherwise the shot's color. */
  color?: string;
  stroke: Stroke;
  /** One entry per segment between points. Missing or null follows `stroke`. */
  segments?: ({ pattern?: string } | null)[];
  start: Ending;
  end: Ending;
  outline?: Outline;
  caption: Caption;
  contCaption?: ContCaption;
  marginContinuation?: MarginContinuation;
  /** Present only for shot fields this line replaces. */
  own?: MarkOwn;
};

export type TextMark = MarkBase & {
  kind: "text";
  /** Left edge and first baseline. */
  x: number;
  y: number;
  show: boolean;
  /** Present only when the note is Custom. Otherwise it shows the linked shot's text. */
  text?: string;
  /** Present only when the note has its own color. Otherwise the shot's color. */
  color?: string;
  style: TextStyle;
  widthPt?: number;
  minHeightPt?: number;
  outline?: Outline;
  /** Present only for shot fields this note replaces. */
  own?: MarkOwn;
};

export type ShapeMark = MarkBase & {
  kind: "shape";
  /** Registry key: rectangle, ellipse, highlight, polygon, star, bracket, stamp. */
  shape: string;
  /** Box before rotation. */
  x: number;
  y: number;
  widthPt: number;
  heightPt: number;
  /** Degrees, clockwise. */
  rotation: number;
  /** Polygons. */
  sides?: number;
  /** Stars. */
  points?: number;
  innerDepthPct?: number;
  /** Ending stamps: which ending to draw. */
  stamp?: string;
  color?: string;
  stroke?: Stroke;
  fill?: { color?: string; opacityPct: number };
  outline?: Outline;
};

export type ImageMark = {
  id: string;
  kind: "image";
  page: number;
  /** Top-left corner. */
  x: number;
  y: number;
  /** Height follows the image's proportions. */
  widthPt: number;
  assetId: string;
};

export type Mark = LineMark | TextMark | ShapeMark | ImageMark;

export type MarkKind = Mark["kind"];

/** An image file stored under `assets/` in the project ZIP. */
export type Asset = {
  id: string;
  name: string;
  type: "image/jpeg" | "image/png";
  widthPx: number;
  heightPx: number;
};

/* ---------- Settings ---------- */

/** One entry of a choice list (status, tags, …). Custom keys start with `custom:`. */
export type ListEntry = { key: string; label: string; icon?: string; color?: string };

/**
 * How a caption field joins the piece before it.
 * Wrapping kinds (parentheses, brackets, braces, quotes) also surround the field.
 * Custom uses `dividerText`, where … stands for the field's value.
 */
export type CaptionDivider =
  | "space"
  | "none"
  | "hyphen"
  | "spacedHyphen"
  | "comma"
  | "slash"
  | "dot"
  | "parens"
  | "brackets"
  | "braces"
  | "quotes"
  | "custom";

export type CaptionField = {
  id: string;
  print: boolean;
  /** Missing means the usual one for this field: a hyphen for shot type, parentheses for additional info, a space otherwise. */
  divider?: CaptionDivider;
  /** Used when `divider` is custom. `…` is replaced by the field's text, so ` (…)` surrounds it. */
  dividerText?: string;
};

export type LineDefaults = {
  stroke: Stroke;
  start: Ending;
  end: Ending;
  caption: TextStyle;
  outline?: Outline;
  captionOutline?: Outline;
};

export type ShapeDefaults = {
  shape: string;
  stroke?: Stroke;
  fill?: { opacityPct: number };
  outline?: Outline;
};

export type TextDefaults = {
  color: string;
  style: TextStyle;
  outline?: Outline;
};

export type ProjectSettings = {
  general: {
    shotIdStyle: "letter" | "decimal";
    additionalInfoStyle: "parens" | "hyphen";
    newShotColor: string;
    newShotPriority: string;
  };
  captions: {
    /** Print order and default inclusion. */
    fields: CaptionField[];
    offsetAcrossPt: number;
    offsetAbovePt: number;
    contGapPt: number;
    /** Excel-style date codes. */
    dateFormat: string;
  };
  markDefaults: {
    line: LineDefaults;
    shape: ShapeDefaults;
    text: TextDefaults;
  };
  drawing: {
    /** 0 is off. */
    angleSnapDegrees: number;
    firstPageAlone: boolean;
    /** A new line copies the previous line's style instead of the defaults. */
    newLineCopiesPrevious: boolean;
  };
  /** Per-project choice lists. `tags` is the project tag list. */
  lists: Record<string, ListEntry[]>;
  /** Remembered shot-list import column mapping: source header to field. */
  importMapping?: Record<string, string>;
};

export type Project = {
  version: 2;
  /** Set when saving. */
  savedAt?: string;
  appVersion?: string;
  name: string;
  script?: ScriptInfo;
  settings: ProjectSettings;
  scenes: Scene[];
  marks: Mark[];
  assets: Asset[];
  /**
   * Version 1 marks that could not be placed yet because the script PDF (and so
   * the page sizes) was missing when the old save was opened. They are placed
   * as soon as the script is imported.
   */
  unplacedV1Marks?: unknown[];
};
