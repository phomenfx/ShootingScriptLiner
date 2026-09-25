import { effectiveLocation, effectiveScheduledDate, effectiveText } from "./lineCaption";
import { getSortedScenes, getSortedShots, indexToLetters, sceneNumber } from "./labelUtils";
import type { Project, Scene, Shot } from "../types/project";

export const SHOT_LIST_COLUMNS = [
  "Scene",
  "Shot",
  "Type",
  "Subject",
  "Additional info",
  "Indicator",
  "Location",
  "Time",
  "System/Movement",
  "Lens",
  "Audio",
  "Camera",
  "FPS",
  "Sync",
  "Day Scheduled",
  "Notes",
  "Color",
] as const;

export type ShotListColumn = (typeof SHOT_LIST_COLUMNS)[number];

export type ShotListRow = Record<ShotListColumn, string>;

function shotIndex(scene: Scene, shot: Shot, project: Project): string {
  const sorted = getSortedShots(scene);
  const idx = sorted.findIndex((item) => item.id === shot.id);
  if (idx < 0) return "";
  if (project.labelMode === "letter") return indexToLetters(idx);
  return String(idx + 1);
}

function rowFromShot(scene: Scene, shot: Shot, project: Project): ShotListRow {
  return {
    Scene: String(sceneNumber(scene, project.scenes)),
    Shot: shotIndex(scene, shot, project),
    Type: shot.shotType?.trim() ?? "",
    Subject: shot.subject?.trim() ?? "",
    "Additional info": shot.slug?.trim() ?? "",
    Indicator: effectiveText(shot.indicator, scene.indicator),
    Location: effectiveLocation(scene, shot),
    Time: effectiveText(shot.timeOfDay, scene.timeOfDay),
    "System/Movement": effectiveText(shot.cameraSupport, scene.cameraSupport),
    Lens: effectiveText(shot.lens, scene.lens),
    Audio: effectiveText(shot.audioSource, scene.audioSource),
    Camera: effectiveText(shot.camera, scene.camera),
    FPS: effectiveText(shot.fps, scene.fps),
    Sync: effectiveText(shot.sync, scene.sync),
    "Day Scheduled": effectiveScheduledDate(scene, shot),
    Notes: shot.notes?.trim() ?? "",
    Color: shot.color,
  };
}

function rowFromEmptyScene(scene: Scene, project: Project): ShotListRow {
  return {
    Scene: String(sceneNumber(scene, project.scenes)),
    Shot: "",
    Type: "",
    Subject: "",
    "Additional info": "",
    Indicator: scene.indicator?.trim() ?? "",
    Location: scene.location?.trim() ?? "",
    Time: scene.timeOfDay?.trim() ?? "",
    "System/Movement": scene.cameraSupport?.trim() ?? "",
    Lens: scene.lens?.trim() ?? "",
    Audio: scene.audioSource?.trim() ?? "",
    Camera: scene.camera?.trim() ?? "",
    FPS: scene.fps?.trim() ?? "",
    Sync: scene.sync?.trim() ?? "",
    "Day Scheduled": scene.scheduledDate?.trim() ?? "",
    Notes: "",
    Color: "",
  };
}

export function buildShotListRows(project: Project): ShotListRow[] {
  const rows: ShotListRow[] = [];
  for (const scene of getSortedScenes(project.scenes)) {
    const shots = getSortedShots(scene);
    if (shots.length === 0) {
      rows.push(rowFromEmptyScene(scene, project));
      continue;
    }
    for (const shot of shots) rows.push(rowFromShot(scene, shot, project));
  }
  return rows;
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function rowsToCsv(rows: ShotListRow[]): string {
  const lines = [
    SHOT_LIST_COLUMNS.map(csvCell).join(","),
    ...rows.map((row) => SHOT_LIST_COLUMNS.map((column) => csvCell(row[column])).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}`;
}
