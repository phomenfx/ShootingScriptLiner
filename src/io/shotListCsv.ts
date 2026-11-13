/**
 * The shot list as a spreadsheet. One row per shot, in order; a scene with no
 * shots still gets a row. The columns match the shot-list table.
 *
 * A cell with several values joins them with "; ". Camera and Lens are
 * separate columns in matching order: the lenses of one camera join with
 * " + ", and cameras are separated by "; ".
 */
import { cameraNames, effectiveShot } from "../model/captions";
import { formatEighths, formatPageRange, shotLength } from "../model/pageLength";
import { choiceLabel } from "../model/registry";
import { listScenes } from "../model/shotList";
import type { CameraRow, Project } from "../model/types";

export const SHOT_LIST_COLUMNS = [
  "Scene",
  "Shot",
  "Status",
  "Priority",
  "Type",
  "Angle",
  "Subject",
  "Cast",
  "Additional info",
  "Tags",
  "Indicator",
  "Location",
  "Time",
  "Setup",
  "Est. minutes",
  "Movement",
  "System",
  "Camera",
  "Lens",
  "Audio",
  "FPS",
  "Sync",
  "Day Scheduled",
  "Notes",
  "Pages",
  "Eighths",
  "Lines",
  "Color",
] as const;

export type ShotListColumn = (typeof SHOT_LIST_COLUMNS)[number];
export type ShotListRow = Record<ShotListColumn, string>;

export const MULTI_VALUE_SEPARATOR = "; ";
export const LENS_SEPARATOR = " + ";

const multi = (values: string[] | undefined) => (values ?? []).filter(Boolean).join(MULTI_VALUE_SEPARATOR);
const lensCell = (cameras: CameraRow[]) =>
  cameras.some((camera) => camera.lenses.length > 0)
    ? cameras.map((camera) => camera.lenses.join(LENS_SEPARATOR)).join(MULTI_VALUE_SEPARATOR)
    : "";

function emptyRow(): ShotListRow {
  return Object.fromEntries(SHOT_LIST_COLUMNS.map((column) => [column, ""])) as ShotListRow;
}

export function buildShotListRows(project: Project): ShotListRow[] {
  const lists = project.settings.lists;
  const rows: ShotListRow[] = [];
  for (const { scene, sceneIndex, shots } of listScenes(project)) {
    const sceneNumber = String(sceneIndex + 1);
    const style = project.settings.general.shotIdStyle;

    if (shots.length === 0) {
      const d = scene.defaults;
      rows.push({
        ...emptyRow(),
        Scene: sceneNumber,
        Indicator: scene.heading.indicator,
        Location: scene.heading.location,
        Time: scene.heading.time,
        Movement: multi(d.movement),
        System: multi(d.system),
        Camera: multi(cameraNames(d.cameras)),
        Lens: lensCell(d.cameras),
        Audio: multi(d.audio),
        FPS: d.fps ?? "",
        Sync: choiceLabel("sync", d.sync, lists),
        "Day Scheduled": d.date ?? "",
      });
      continue;
    }

    for (const { shot, id } of shots) {
      const e = effectiveShot(scene, shot);
      const length = shotLength(project, shot.id);
      rows.push({
        Scene: sceneNumber,
        // The part of the ID after the scene number: A, B… or 1, 2…
        Shot: style === "letter" ? id.slice(sceneNumber.length) : id.slice(sceneNumber.length + 1),
        Status: choiceLabel("status", shot.status, lists),
        Priority: choiceLabel("priority", shot.priority, lists),
        Type: shot.type?.trim() ?? "",
        Angle: choiceLabel("angle", shot.angle, lists),
        Subject: shot.subject?.trim() ?? "",
        Cast: multi(shot.cast),
        "Additional info": shot.additionalInfo?.trim() ?? "",
        Tags: multi(shot.tags?.map((tag) => choiceLabel("tags", tag, lists))),
        Indicator: e.indicator,
        Location: e.location,
        Time: e.time,
        Setup: shot.setup ?? "",
        "Est. minutes": shot.estimatedMinutes === undefined ? "" : String(shot.estimatedMinutes),
        Movement: multi(e.movement),
        System: multi(e.system),
        Camera: multi(cameraNames(e.cameras)),
        Lens: lensCell(e.cameras),
        Audio: multi(e.audio),
        FPS: e.fps ?? "",
        Sync: choiceLabel("sync", e.sync, lists),
        "Day Scheduled": e.date ?? "",
        Notes: shot.notes?.trim() ?? "",
        Pages: formatPageRange(length.pages).replace(/^pages? /, ""),
        Eighths: length.lineCount > 0 ? formatEighths(length.eighths) : "",
        Lines: String(length.lineCount),
        Color: shot.color,
      });
    }
  }
  return rows;
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** CSV text with a byte-order mark so spreadsheet apps read accents correctly. */
export function rowsToCsv(rows: ShotListRow[]): string {
  const lines = [
    SHOT_LIST_COLUMNS.map(csvCell).join(","),
    ...rows.map((row) => SHOT_LIST_COLUMNS.map((column) => csvCell(row[column])).join(",")),
  ];
  return `﻿${lines.join("\r\n")}`;
}
