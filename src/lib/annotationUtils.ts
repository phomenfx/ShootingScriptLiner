import { formatShotLabel } from "./labelUtils";
import { migrateCapName } from "./lineCaps";
import { normalizeStroke } from "./lineStrokes";
import type { LineAnnotation, LineEnding, LineStyle, TextAnnotation } from "../types/annotations";
import { DEFAULT_LINE_LOCKS, UNLINKED_LINE_LOCKS, isTextAnnotation } from "../types/annotations";
import { DEFAULT_LINE_DEFAULTS, type LineDefaults } from "../types/lineDefaults";
import type { Project, Scene, Shot } from "../types/project";
import { newId } from "./ids";

export function findShot(
  project: Project,
  shotId: string | undefined
): { scene: Scene; shot: Shot } | null {
  if (!shotId) return null;
  for (const scene of project.scenes) {
    const shot = scene.shots.find((s) => s.id === shotId);
    if (shot) return { scene, shot };
  }
  return null;
}

export function isAnnotationVisible(
  project: Project,
  line: LineAnnotation
): boolean {
  if (!line.shotId) return true;
  const found = findShot(project, line.shotId);
  if (!found) return true;
  return found.scene.visible && found.shot.visible;
}

export function getLineDisplayLabel(line: LineAnnotation, project: Project): string {
  if (line.locks.label === false && line.label !== undefined && line.label !== "") {
    return line.label;
  }
  if (line.shotId) {
    const found = findShot(project, line.shotId);
    if (found) {
      return formatShotLabel(
        found.scene,
        found.shot,
        project.scenes,
        project.labelMode,
        project.additionalInfoStyle
      );
    }
  }
  return line.label ?? "";
}

/** Primary + optional secondary "(cont.)" for margin continuation (see `marginContinuation`). */
export function getLineScriptLabels(
  line: LineAnnotation,
  project: Project
): { primary: string; secondary?: string } {
  if (!line.showLabel) return { primary: "" };
  const base = getLineDisplayLabel(line, project);
  if (line.marginContinuation === "top") {
    return { primary: base ? `${base} (cont.)` : "(cont.)" };
  }
  if (line.marginContinuation === "bottom") {
    return { primary: base, secondary: "(cont.)" };
  }
  return { primary: base };
}

/** @deprecated Prefer getLineScriptLabels for layout; returns primary only. */
export function getLineScriptLabel(line: LineAnnotation, project: Project): string {
  return getLineScriptLabels(line, project).primary;
}

export function resolveLineStyle(line: LineAnnotation, project: Project): LineStyle {
  const found = line.shotId ? findShot(project, line.shotId) : null;
  const style = { ...line.style };

  if (line.locks.color && found) {
    style.color = found.shot.color;
  }
  return style;
}

export function getLineFontFamily(line: LineAnnotation, project: Project): string {
  return line.fontFamily || project.defaultLine.fontFamily;
}

export function getLineFontSizePt(line: LineAnnotation, project: Project): number {
  return line.fontSizePt ?? project.defaultLine.fontSizePt;
}

export function getLineLabelBold(line: LineAnnotation, project: Project): boolean {
  return line.labelBold ?? project.defaultLine.labelBold;
}

export function getTextLabelBold(text: TextAnnotation, project: Project): boolean {
  return text.labelBold ?? project.defaultLine.labelBold;
}

/** Endpoint index used for bottom-margin secondary “(cont.)” label (prefer arrow end). */
export function lineEndIndexForContLabel(line: LineAnnotation): 0 | 1 {
  if (line.style.end.cap !== "none") return 1;
  if (line.style.start.cap !== "none") return 0;
  return 1;
}

function migrateEnding(
  raw: Record<string, unknown> | undefined,
  legacyCap?: string
): LineEnding {
  if (raw && typeof raw.cap === "string") {
    const oldCap = raw.cap;
    const cap = migrateCapName(oldCap);
    const scalePercent = Number(raw.scalePercent) || 100;
    let filled: boolean;
    if (typeof raw.filled === "boolean") {
      filled = raw.filled;
    } else if (oldCap === "openArrow" || oldCap === "openArrowReversed") {
      filled = false;
    } else if (oldCap === "closedArrow" || oldCap === "closedArrowReversed") {
      filled = true;
    } else if (cap === "arrow" || cap === "arrowReversed") {
      filled = true;
    } else {
      filled = cap === "square" || cap === "circle";
    }
    return { cap, scalePercent, filled };
  }
  const cap = legacyCap ? migrateCapName(legacyCap) : "none";
  return {
    cap,
    scalePercent: 100,
    filled: cap === "arrow" || cap === "arrowReversed" || cap === "square" || cap === "circle",
  };
}

export function migrateLineDefaults(
  raw: Partial<LineDefaults> & Record<string, unknown>,
  legacyProjectLabelBold?: boolean
): LineDefaults {
  const legacy = raw as { startCap?: string; endCap?: string };
  const labelBold =
    typeof raw.labelBold === "boolean"
      ? raw.labelBold
      : legacyProjectLabelBold !== undefined
        ? legacyProjectLabelBold
        : DEFAULT_LINE_DEFAULTS.labelBold;
  return {
    ...DEFAULT_LINE_DEFAULTS,
    ...raw,
    stroke: normalizeStroke(String(raw.stroke ?? DEFAULT_LINE_DEFAULTS.stroke)),
    labelBold,
    start: migrateEnding(
      raw.start as Record<string, unknown> | undefined,
      legacy.startCap
    ),
    end: migrateEnding(raw.end as Record<string, unknown> | undefined, legacy.endCap),
  };
}

/** Migrate legacy annotations (width 1|2|3, startCap/endCap, missing font fields). */
export function migrateLineAnnotation(
  raw: Record<string, unknown>,
  defaultLabelBold = DEFAULT_LINE_DEFAULTS.labelBold
): LineAnnotation {
  const styleRaw = (raw.style ?? {}) as Record<string, unknown>;
  let widthPt = DEFAULT_LINE_DEFAULTS.widthPt;
  if (typeof styleRaw.widthPt === "number") {
    widthPt = styleRaw.widthPt;
  } else if (typeof styleRaw.width === "number") {
    const w = styleRaw.width as number;
    widthPt = w <= 3 ? [1, 2, 3][w - 1] ?? w * 1.5 : w;
  }

  const locksRaw = (raw.locks ?? {}) as Record<string, boolean>;
  const locks = {
    shotId: locksRaw.shotId ?? !!raw.shotId,
    shotType: locksRaw.shotType ?? locksRaw.shotId ?? !!raw.shotId,
    label: locksRaw.label ?? !!raw.shotId,
    color: locksRaw.color ?? !!raw.shotId,
  };

  const start = migrateEnding(
    styleRaw.start as Record<string, unknown>,
    styleRaw.startCap as string | undefined
  );
  const end = migrateEnding(
    styleRaw.end as Record<string, unknown>,
    styleRaw.endCap as string | undefined
  );

  const legacyContFrom = raw.continuedFromLineId as string | undefined;
  const legacyContinues = !!raw.continuesToNextPage;
  const legacyFromPrev = !!raw.continuedFromPrevPage;
  let marginContinuation = raw.marginContinuation as LineAnnotation["marginContinuation"] | undefined;
  if (marginContinuation !== "top" && marginContinuation !== "bottom") {
    marginContinuation = undefined;
  }
  if (!marginContinuation && legacyContinues && !legacyContFrom) {
    marginContinuation = "bottom";
  }
  if (!marginContinuation && legacyFromPrev && legacyContFrom) {
    marginContinuation = "top";
  }

  const line: LineAnnotation = {
    id: String(raw.id),
    kind: "line",
    page: Number(raw.page) || 1,
    points: raw.points as LineAnnotation["points"],
    style: {
      stroke: normalizeStroke(String(styleRaw.stroke ?? "solid")),
      widthPt,
      color: String(styleRaw.color ?? "#FF0000"),
      start,
      end,
    },
    fontFamily: String(raw.fontFamily ?? DEFAULT_LINE_DEFAULTS.fontFamily),
    fontSizePt: Number(raw.fontSizePt) || DEFAULT_LINE_DEFAULTS.fontSizePt,
    labelBold:
      typeof raw.labelBold === "boolean" ? raw.labelBold : defaultLabelBold,
    shotId: raw.shotId as string | undefined,
    label: raw.label as string | undefined,
    showLabel: raw.showLabel !== false,
    locks,
  };
  if (marginContinuation) line.marginContinuation = marginContinuation;
  return line;
}

function templateForNewLine(
  project: Project,
  endOverride?: Partial<LineEnding>
): Pick<LineAnnotation, "style" | "fontFamily" | "fontSizePt" | "labelBold"> {
  const lineAnnotations = project.annotations.filter(
    (a): a is LineAnnotation => a.kind === "line"
  );
  const last = lineAnnotations[lineAnnotations.length - 1];

  if (project.inheritLineFromPrevious && last) {
    return {
      style: {
        ...last.style,
        start: { ...last.style.start },
        end: { ...last.style.end, ...endOverride },
      },
      fontFamily: last.fontFamily,
      fontSizePt: last.fontSizePt,
      labelBold: last.labelBold,
    };
  }

  const d = project.defaultLine;
  return {
    style: {
      stroke: d.stroke,
      widthPt: d.widthPt,
      color: project.defaultShotColor,
      start: { ...d.start },
      end: { ...d.end, ...endOverride },
    },
    fontFamily: d.fontFamily,
    fontSizePt: d.fontSizePt,
    labelBold: d.labelBold,
  };
}

export function createLineFromShot(
  page: number,
  points: [LineAnnotation["points"][0], LineAnnotation["points"][1]],
  project: Project,
  shotId: string | undefined
): LineAnnotation {
  const found = shotId ? findShot(project, shotId) : null;
  const tmpl = templateForNewLine(project);
  const color = found?.shot.color ?? project.defaultShotColor;

  return {
    id: newId(),
    kind: "line",
    page,
    points,
    style: { ...tmpl.style, color },
    fontFamily: tmpl.fontFamily,
    fontSizePt: tmpl.fontSizePt,
    labelBold: tmpl.labelBold,
    shotId,
    showLabel: true,
    locks: shotId ? { ...DEFAULT_LINE_LOCKS } : { ...UNLINKED_LINE_LOCKS },
  };
}

export function cloneLineStyle(style: LineStyle): LineStyle {
  return {
    ...style,
    start: { ...style.start },
    end: { ...style.end },
  };
}

export function cloneLine(line: LineAnnotation, page?: number): LineAnnotation {
  const offset = 0.02;
  return {
    ...line,
    id: newId(),
    page: page ?? line.page,
    points: [
      { x: line.points[0].x + offset, y: line.points[0].y + offset },
      { x: line.points[1].x + offset, y: line.points[1].y + offset },
    ],
    style: cloneLineStyle(line.style),
    locks: { ...line.locks },
    marginContinuation: undefined,
  };
}

export function annotationsForPage(
  project: Project,
  page: number
): LineAnnotation[] {
  return project.annotations.filter(
    (a): a is LineAnnotation => a.kind === "line" && a.page === page
  );
}

export function textAnnotationsForPage(project: Project, page: number): TextAnnotation[] {
  return project.annotations.filter(
    (a): a is TextAnnotation => isTextAnnotation(a) && a.page === page
  );
}

export function migrateTextAnnotation(
  raw: Record<string, unknown>,
  defaultLabelBold = DEFAULT_LINE_DEFAULTS.labelBold
): TextAnnotation {
  const text: TextAnnotation = {
    id: String(raw.id),
    kind: "text",
    page: Number(raw.page) || 1,
    x: typeof raw.x === "number" ? raw.x : 0.5,
    y: typeof raw.y === "number" ? raw.y : 0.5,
    text: String(raw.text ?? "Note"),
    color: String(raw.color ?? "#111111"),
    fontSize: typeof raw.fontSize === "number" ? raw.fontSize : 11,
    fontFamily:
      typeof raw.fontFamily === "string"
        ? raw.fontFamily
        : '"Arial", sans-serif',
  };
  if (typeof raw.labelBold === "boolean") {
    text.labelBold = raw.labelBold;
  } else if (typeof raw.bold === "boolean") {
    text.labelBold = raw.bold;
  } else {
    text.labelBold = defaultLabelBold;
  }
  return text;
}

export function getProjectCacheKey(project: Project): string {
  const name = project.name.replace(/[^\w.-]+/g, "_") || "project";
  const script = project.scriptFileName ?? "none";
  return `${name}__${script}`;
}
