import { migrateLineAnnotation, migrateLineDefaults, migrateTextAnnotation } from "./annotationUtils";
import type {
  AdditionalInfoStyle,
  LabelMode,
  Project,
  Scene,
  Shot,
} from "../types/project";
import { migrateLabelLayout } from "../types/labelLayout";
import { DEFAULT_PROJECT } from "../types/project";
import { DEFAULT_LINE_DEFAULTS } from "../types/lineDefaults";

/** Excel-style: 0 → A, 25 → Z, 26 → AA */
export function indexToLetters(index: number): string {
  let n = index;
  let result = "";
  while (n >= 0) {
    result = String.fromCharCode((n % 26) + 65) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

export function getSortedScenes(scenes: Scene[]): Scene[] {
  return [...scenes].sort((a, b) => a.order - b.order);
}

export function sceneNumber(scene: Scene, scenes: Scene[]): number {
  const sorted = getSortedScenes(scenes);
  const idx = sorted.findIndex((s) => s.id === scene.id);
  return idx >= 0 ? idx + 1 : 0;
}

export function getSortedShots(scene: Scene): Shot[] {
  return [...scene.shots].sort((a, b) => a.order - b.order);
}

/** After reordering the shots array (drag), sync order fields to match indices. */
export function assignShotOrders(shots: Shot[]): Shot[] {
  return shots.map((shot, idx) => ({ ...shot, order: idx }));
}

export function shotLetter(shot: Shot, scene: Scene): string {
  const sorted = getSortedShots(scene);
  const idx = sorted.findIndex((s) => s.id === shot.id);
  return idx >= 0 ? indexToLetters(idx) : "";
}

export function formatShotLabel(
  scene: Scene,
  shot: Shot,
  scenes: Scene[],
  labelMode: LabelMode,
  additionalInfoStyle: AdditionalInfoStyle = "parens"
): string {
  const num = sceneNumber(scene, scenes);
  const sorted = getSortedShots(scene);
  const idx = sorted.findIndex((s) => s.id === shot.id);

  let id: string;
  if (labelMode === "letter") {
    id = `${num}${idx >= 0 ? indexToLetters(idx) : ""}`;
  } else {
    id = `${num}.${idx >= 0 ? idx + 1 : 1}`;
  }

  const type = shot.shotType?.trim() ?? "";
  const head = [id, type].filter(Boolean).join("-");
  const label = shot.subject?.trim() ?? "";
  const extra = shot.slug?.trim() ?? "";

  if (label && extra) {
    if (additionalInfoStyle === "parens") {
      return `${head} ${label} (${extra})`;
    }
    return `${head} ${label} - ${extra}`;
  }
  if (label) return `${head} ${label}`;
  if (extra) {
    if (additionalInfoStyle === "parens") return `${head} (${extra})`;
    return `${head} - ${extra}`;
  }
  return head;
}

/** Reassign order fields 0..n-1; uses array order (call after drag splice). */
export function renumberAll(scenes: Scene[]): Scene[] {
  return scenes.map((scene, sceneIdx) => {
    const shotsSorted = getSortedShots(scene);
    const shots = shotsSorted.map((shot, shotIdx) => ({
      ...shot,
      order: shotIdx,
    }));
    return { ...scene, order: sceneIdx, shots };
  });
}

export function serializeProject(project: Project): string {
  const normalized: Project = {
    version: 1,
    name: project.name,
    labelMode: project.labelMode,
    additionalInfoStyle: project.additionalInfoStyle,
    defaultShotColor: project.defaultShotColor,
    snapAngleDegrees: project.snapAngleDegrees,
    inheritLineFromPrevious: project.inheritLineFromPrevious,
    labelOffsetXPt: project.labelOffsetXPt,
    labelOffsetYPt: project.labelOffsetYPt,
    labelSecondaryGapPt: project.labelSecondaryGapPt,
    defaultLine: project.defaultLine,
    scriptFileName: project.scriptFileName,
    scenes: renumberAll(getSortedScenes(project.scenes)),
    annotations: project.annotations,
  };
  return JSON.stringify(normalized, null, 2);
}

export function parseProject(json: string): Project {
  const data = JSON.parse(json) as Project;
  if (data.version !== 1) {
    throw new Error("Unsupported project version");
  }
  const loaded = data.scenes ?? [];
  const sorted = getSortedScenes(loaded);
  const legacyLabelBold =
    typeof (data as { labelBold?: boolean }).labelBold === "boolean"
      ? (data as { labelBold?: boolean }).labelBold
      : undefined;
  const defaultLine = migrateLineDefaults(
    (data.defaultLine ?? {}) as Partial<typeof DEFAULT_LINE_DEFAULTS> & Record<string, unknown>,
    legacyLabelBold
  );
  const annotations = Array.isArray(data.annotations)
    ? data.annotations
        .filter((a) => {
          const row = a as Record<string, unknown>;
          if (row.kind !== "line") return true;
          return !row.continuedFromLineId;
        })
        .map((a) => {
          const row = a as Record<string, unknown>;
          if (row.kind === "line") return migrateLineAnnotation(row, defaultLine.labelBold);
          if (row.kind === "text") return migrateTextAnnotation(row, defaultLine.labelBold);
          return a;
        })
    : [];

  return {
    ...DEFAULT_PROJECT,
    ...data,
    additionalInfoStyle: data.additionalInfoStyle ?? "parens",
    snapAngleDegrees:
      data.snapAngleDegrees ??
      ((data as { snapLineAngles?: boolean }).snapLineAngles === false
        ? 0
        : (data as { snapLineAngles?: boolean }).snapLineAngles
          ? 15
          : 15),
    inheritLineFromPrevious: data.inheritLineFromPrevious ?? false,
    ...migrateLabelLayout(data),
    defaultLine,
    annotations,
    scenes: renumberAll(sorted),
  };
}
