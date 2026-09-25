import { formatExcelDate } from "./dateFormat";
import { getSortedShots, indexToLetters, sceneNumber } from "./labelUtils";
import type { LineLabelFieldId } from "../types/lineLabelFields";
import { DEFAULT_LINE_LABEL_FIELDS } from "../types/lineLabelFields";
import type { AdditionalInfoStyle, Project, Scene, Shot } from "../types/project";

/** Shot text wins when it is non-empty. Otherwise the scene value is used. */
export function effectiveText(shotValue?: string, sceneValue?: string): string {
  const override = shotValue?.trim() ?? "";
  if (override) return override;
  return sceneValue?.trim() ?? "";
}

export function effectiveLocation(scene: Scene, shot: Shot): string {
  return effectiveText(shot.location, scene.location);
}

export function effectiveScheduledDate(scene: Scene, shot: Shot): string {
  return effectiveText(shot.scheduledDate, scene.scheduledDate);
}

export function lineLabelFieldEnabled(
  project: Project,
  shot: Shot,
  id: LineLabelFieldId
): boolean {
  const override = shot.lineLabelInclude?.[id];
  if (typeof override === "boolean") return override;
  const field = project.lineLabelFields.find((item) => item.id === id);
  if (field) return field.enabled;
  return DEFAULT_LINE_LABEL_FIELDS.find((item) => item.id === id)?.enabled ?? false;
}

/** Drop an override that matches the project default so the shot keeps following Settings. */
export function nextLineLabelInclude(
  project: Project,
  shot: Shot,
  id: LineLabelFieldId,
  enabled: boolean
): Shot["lineLabelInclude"] {
  const projectDefault =
    project.lineLabelFields.find((item) => item.id === id)?.enabled ??
    DEFAULT_LINE_LABEL_FIELDS.find((item) => item.id === id)?.enabled ??
    false;
  const next = { ...(shot.lineLabelInclude ?? {}) };
  if (enabled === projectDefault) delete next[id];
  else next[id] = enabled;
  return Object.keys(next).length > 0 ? next : undefined;
}

function shotNumberToken(scene: Scene, shot: Shot, project: Project): string {
  const num = sceneNumber(scene, project.scenes);
  const sorted = getSortedShots(scene);
  const idx = sorted.findIndex((item) => item.id === shot.id);
  if (project.labelMode === "letter") {
    return `${num}${idx >= 0 ? indexToLetters(idx) : ""}`;
  }
  return `${num}.${idx >= 0 ? idx + 1 : 1}`;
}

function fieldText(scene: Scene, shot: Shot, project: Project, id: LineLabelFieldId): string {
  switch (id) {
    case "shotNumber":
      return shotNumberToken(scene, shot, project);
    case "shotType":
      return shot.shotType?.trim() ?? "";
    case "subject":
      return shot.subject?.trim() ?? "";
    case "additionalInfo":
      return shot.slug?.trim() ?? "";
    case "cameraSupport":
      return effectiveText(shot.cameraSupport, scene.cameraSupport);
    case "lens":
      return effectiveText(shot.lens, scene.lens);
    case "audio":
      return effectiveText(shot.audioSource, scene.audioSource);
    case "indicator":
      return effectiveText(shot.indicator, scene.indicator);
    case "location":
      return effectiveLocation(scene, shot);
    case "timeOfDay":
      return effectiveText(shot.timeOfDay, scene.timeOfDay);
    case "camera":
      return effectiveText(shot.camera, scene.camera);
    case "fps":
      return effectiveText(shot.fps, scene.fps);
    case "sync":
      return effectiveText(shot.sync, scene.sync);
    case "scheduledDate":
      return formatExcelDate(effectiveScheduledDate(scene, shot), project.scheduledDateFormat);
    case "notes":
      return shot.notes?.trim() ?? "";
    default:
      return "";
  }
}

function formatAdditional(
  previous: string,
  extra: string,
  style: AdditionalInfoStyle,
  followsSubject: boolean
): string {
  if (followsSubject) {
    if (style === "parens") return `${previous} (${extra})`;
    return `${previous} - ${extra}`;
  }
  if (style === "parens") return `(${extra})`;
  return `- ${extra}`;
}

/** Caption drawn on a linked line and on shot-following text. */
export function formatLineCaption(scene: Scene, shot: Shot, project: Project): string {
  const fields = project.lineLabelFields.length > 0 ? project.lineLabelFields : DEFAULT_LINE_LABEL_FIELDS;
  const pieces: { id: LineLabelFieldId; text: string }[] = [];
  for (const field of fields) {
    if (!lineLabelFieldEnabled(project, shot, field.id)) continue;
    const text = fieldText(scene, shot, project, field.id).trim();
    if (!text) continue;
    pieces.push({ id: field.id, text });
  }

  const parts: string[] = [];
  for (let i = 0; i < pieces.length; i += 1) {
    const current = pieces[i];
    const next = pieces[i + 1];
    if (!current) continue;
    if (current.id === "shotNumber" && next?.id === "shotType") {
      parts.push(`${current.text}-${next.text}`);
      i += 1;
      continue;
    }
    if (current.id === "additionalInfo") {
      const followsSubject = pieces[i - 1]?.id === "subject";
      if (followsSubject && parts.length > 0) {
        const previous = parts.pop() ?? "";
        parts.push(formatAdditional(previous, current.text, project.additionalInfoStyle, true));
      } else {
        parts.push(formatAdditional("", current.text, project.additionalInfoStyle, false));
      }
      continue;
    }
    parts.push(current.text);
  }
  return parts.join(" ");
}
