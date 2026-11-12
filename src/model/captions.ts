/**
 * What a shot says about itself: the values it uses (its own or its scene's),
 * the text of each caption field, and the caption drawn on linked marks.
 */
import { formatExcelDate } from "../lib/dateFormat";
import type { FoundShot } from "./edits";
import { CAPTION_FIELDS, choiceLabel } from "./registry";
import { shotIdLabel } from "./shotList";
import type { CameraRow, Project, Scene, Shot, ShotOwn } from "./types";

export type EffectiveShot = Required<Pick<ShotOwn, "indicator" | "location" | "time" | "movement" | "cameras" | "audio">> &
  Pick<ShotOwn, "fps" | "sync" | "date">;

/** Every inheritable value as the shot uses it: its override when unlocked, else the scene's. */
export function effectiveShot(scene: Scene, shot: Shot): EffectiveShot {
  const own = shot.own ?? {};
  const d = scene.defaults;
  return {
    indicator: own.indicator ?? scene.heading.indicator,
    location: own.location ?? scene.heading.location,
    time: own.time ?? scene.heading.time,
    movement: own.movement ?? d.movement,
    cameras: own.cameras ?? d.cameras,
    audio: own.audio ?? d.audio,
    fps: own.fps ?? d.fps,
    sync: own.sync ?? d.sync,
    date: own.date ?? d.date,
  };
}

export function cameraNames(cameras: CameraRow[]): string[] {
  return cameras.map((camera) => camera.name).filter(Boolean);
}

export function cameraLenses(cameras: CameraRow[]): string[] {
  return cameras.flatMap((camera) => camera.lenses);
}

/** Whether a field prints for this shot: its own checkbox when set, else the project setting. */
export function printsField(project: Project, shot: Shot, fieldId: string): boolean {
  const own = shot.print?.[fieldId];
  if (typeof own === "boolean") return own;
  const field = project.settings.captions.fields.find((f) => f.id === fieldId);
  return field?.print ?? CAPTION_FIELDS.find((f) => f.id === fieldId)?.print ?? false;
}

/** The shot's print checkboxes after one is changed. A value equal to the project setting is not kept. */
export function withPrintField(project: Project, shot: Shot, fieldId: string, print: boolean): Shot {
  const projectDefault =
    project.settings.captions.fields.find((f) => f.id === fieldId)?.print ??
    CAPTION_FIELDS.find((f) => f.id === fieldId)?.print ??
    false;
  const next = { ...shot.print };
  if (print === projectDefault) delete next[fieldId];
  else next[fieldId] = print;
  if (Object.keys(next).length === 0) {
    const { print: _removed, ...rest } = shot;
    return rest;
  }
  return { ...shot, print: next };
}

/** The text one caption field contributes for a shot. Empty when it has nothing to say. */
export function captionFieldText(project: Project, found: FoundShot, fieldId: string): string {
  const { scene, shot, sceneIndex, shotIndex } = found;
  const lists = project.settings.lists;
  const e = effectiveShot(scene, shot);
  const list = (values: string[] | undefined) => (values ?? []).filter(Boolean).join(", ");
  switch (fieldId) {
    case "shotNumber":
      return shotIdLabel(sceneIndex, shotIndex, project.settings.general.shotIdStyle);
    case "type":
      return shot.type?.trim() ?? "";
    case "angle":
      return choiceLabel("angle", shot.angle?.trim(), lists);
    case "subject":
      return shot.subject?.trim() ?? "";
    case "cast":
      return list(shot.cast);
    case "additionalInfo":
      return shot.additionalInfo?.trim() ?? "";
    case "tags":
      return list(shot.tags?.map((tag) => choiceLabel("tags", tag, lists)));
    case "movement":
      return list(e.movement);
    case "lens":
      return list(cameraLenses(e.cameras));
    case "camera":
      return list(cameraNames(e.cameras));
    case "audio":
      return list(e.audio);
    case "indicator":
      return e.indicator.trim();
    case "location":
      return e.location.trim();
    case "time":
      return e.time.trim();
    case "fps":
      return e.fps?.trim() ?? "";
    case "sync":
      return choiceLabel("sync", e.sync, lists);
    case "date":
      return e.date ? formatExcelDate(e.date, project.settings.captions.dateFormat) : "";
    case "notes":
      return shot.notes?.trim() ?? "";
    case "setup":
      return shot.setup?.trim() ?? "";
    default:
      return "";
  }
}

/**
 * The caption for a shot, built from the fields that print, in the project's
 * order. The shot number and type join with a hyphen (2A-WS), and additional
 * info attaches to the subject in the project's style: "Alice (Moving)".
 */
export function shotCaption(project: Project, found: FoundShot): string {
  const pieces: { id: string; text: string }[] = [];
  for (const field of project.settings.captions.fields) {
    if (!printsField(project, found.shot, field.id)) continue;
    const text = captionFieldText(project, found, field.id);
    if (text) pieces.push({ id: field.id, text });
  }
  const parens = project.settings.general.additionalInfoStyle === "parens";
  const parts: string[] = [];
  for (let i = 0; i < pieces.length; i += 1) {
    const current = pieces[i]!;
    const next = pieces[i + 1];
    if (current.id === "shotNumber" && next?.id === "type") {
      parts.push(`${current.text}-${next.text}`);
      i += 1;
    } else if (current.id === "additionalInfo") {
      const extra = parens ? `(${current.text})` : `- ${current.text}`;
      if (pieces[i - 1]?.id === "subject" && parts.length > 0) parts.push(`${parts.pop()} ${extra}`);
      else parts.push(extra);
    } else {
      parts.push(current.text);
    }
  }
  return parts.join(" ");
}

/** Short name for a shot in pickers and tabs: "2A WS Alice". */
export function shotName(project: Project, found: FoundShot): string {
  return [captionFieldText(project, found, "shotNumber"), found.shot.type, found.shot.subject]
    .filter(Boolean)
    .join(" ");
}
