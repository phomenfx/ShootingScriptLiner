/*
 * Importing a shot list from a CSV file or cells pasted from a spreadsheet.
 * Columns are matched by header name; rows join scenes by number or slugline.
 * Nothing is ever deleted, and lines on the script are left alone.
 */
import { createScene, createShot } from "./defaults";
import * as edits from "./edits";
import { parseSceneHeading } from "./sceneDetect";
import { parseCellBlock, TABLE_COLUMNS } from "./shotTable";
import { shotIdLabel } from "./shotList";
import type { Project, SceneHeading, Shot, ShotOwn } from "./types";

export type ImportField =
  | "skip"
  | "scene"
  | "shot"
  | "indicator"
  | "location"
  | "time"
  | "color"
  | "status"
  | "priority"
  | "type"
  | "angle"
  | "subject"
  | "cast"
  | "additionalInfo"
  | "tags"
  | "setup"
  | "estimatedMinutes"
  | "movement"
  | "system"
  | "camera"
  | "lens"
  | "audio"
  | "fps"
  | "sync"
  | "date"
  | "notes";

/** Every field a column can go to, with the header names that match it. */
export const IMPORT_FIELDS: { id: ImportField; label: string; names: string[] }[] = [
  { id: "skip", label: "Don't import", names: ["pages", "eighths", "lines", "page count"] },
  { id: "scene", label: "Scene", names: ["scene", "scene #", "scene no", "scene no.", "scene number", "sc", "sc #", "sc#", "slugline", "scene heading"] },
  { id: "shot", label: "Shot", names: ["shot", "shot #", "shot no", "shot number", "shot id", "#"] },
  { id: "indicator", label: "Indicator (INT./EXT.)", names: ["indicator", "int/ext", "i/e", "int./ext."] },
  { id: "location", label: "Location", names: ["location", "set", "setting"] },
  { id: "time", label: "Time of day", names: ["time", "time of day", "tod", "day/night", "d/n"] },
  { id: "status", label: "Status", names: ["status", "done", "shot?", "complete", "completed"] },
  { id: "priority", label: "Priority", names: ["priority", "importance", "must have"] },
  { id: "type", label: "Size", names: ["type", "size", "shot type", "shot size", "framing"] },
  { id: "angle", label: "Angle", names: ["angle", "camera angle", "shot angle"] },
  { id: "subject", label: "Subject", names: ["subject", "action"] },
  { id: "cast", label: "Cast", names: ["cast", "talent", "actors", "actor", "characters", "character"] },
  { id: "additionalInfo", label: "Additional info", names: ["additional info", "info", "extra info", "additional"] },
  { id: "tags", label: "Tags", names: ["tags", "tag", "labels"] },
  { id: "setup", label: "Setup", names: ["setup", "set up", "set-up", "setup #"] },
  { id: "estimatedMinutes", label: "Est. time", names: ["est. minutes", "est. time", "estimated time", "est time", "minutes", "duration", "time estimate"] },
  { id: "movement", label: "Movement", names: ["movement", "camera movement", "move", "moves"] },
  { id: "system", label: "System", names: ["system", "system/movement", "camera system", "rig", "support", "camera support"] },
  { id: "camera", label: "Camera", names: ["camera", "cam", "cameras"] },
  { id: "lens", label: "Lens", names: ["lens", "lenses", "focal length", "mm"] },
  { id: "audio", label: "Audio", names: ["audio", "sound", "mic", "mics"] },
  { id: "fps", label: "FPS", names: ["fps", "frame rate", "framerate"] },
  { id: "sync", label: "Sync", names: ["sync", "sync sound"] },
  { id: "date", label: "Date", names: ["day scheduled", "date", "shoot date", "scheduled", "schedule", "shoot day", "day"] },
  { id: "notes", label: "Notes", names: ["notes", "note", "comments", "comment", "description"] },
  { id: "color", label: "Color", names: ["color", "colour"] },
];

const norm = (text: string) => text.trim().toLowerCase().replace(/\s+/g, " ");

/** The field a header most likely means, or "skip". */
export function matchHeader(header: string): ImportField {
  const h = norm(header);
  if (!h) return "skip";
  const exact = IMPORT_FIELDS.find((f) => f.names.includes(h) || norm(f.label) === h);
  return exact?.id ?? "skip";
}

/** Each header's field: the one chosen last time for that header name, else the best match. */
export function guessMapping(header: string[], remembered: Record<string, string> = {}): ImportField[] {
  return header.map((h) => {
    const saved = remembered[norm(h)];
    return saved && IMPORT_FIELDS.some((f) => f.id === saved) ? (saved as ImportField) : matchHeader(h);
  });
}

/** The remembered mapping after an import: only choices that differ from the best match are kept. */
export function rememberMapping(remembered: Record<string, string> = {}, header: string[], mapping: ImportField[]): Record<string, string> {
  const next = { ...remembered };
  header.forEach((h, i) => {
    const key = norm(h);
    const field = mapping[i];
    if (!key || !field) return;
    if (field === matchHeader(h)) delete next[key];
    else next[key] = field;
  });
  return next;
}

/** Rows from CSV (commas) or spreadsheet cells (tabs), whichever the text uses. */
export function parseTable(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  if (firstLine.includes("\t")) return parseCellBlock(clean).filter((row) => row.some((c) => c.trim()));
  // CSV: same quoting rules as the cell parser, with commas.
  return parseCellBlock(csvToTabs(clean)).filter((row) => row.some((c) => c.trim()));
}

/** Rewrites CSV separators as tabs, leaving commas inside quotes alone. */
function csvToTabs(text: string): string {
  let out = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        out += '""';
        i += 1;
        continue;
      }
      quoted = !quoted;
      out += ch;
    } else if (ch === "," && !quoted) out += "\t";
    else out += ch;
  }
  return out;
}

/** Common words for status and priority. */
function choiceWord(field: "status" | "priority", text: string): string {
  const t = norm(text);
  if (field === "status") {
    if (["yes", "y", "done", "x", "✓", "✔", "shot", "complete", "completed", "true"].includes(t)) return "shot";
    if (["no", "n", "todo", "to do", "planned", "false", ""].includes(t)) return "planned";
    if (["pickup", "pick up", "pick-up", "reshoot"].includes(t)) return "pickup";
    if (["cut", "dropped", "omit", "omitted"].includes(t)) return "cut";
  } else {
    if (["high", "must", "must have", "a", "1", "yes"].includes(t)) return "must";
    if (["medium", "normal", "nice", "nice to have", "b", "2"].includes(t)) return "nice";
    if (["low", "low priority", "c", "3"].includes(t)) return "low";
  }
  return text;
}

export type ImportMode = "update" | "add";

export type ImportPlan = {
  project: Project;
  newScenes: number;
  updatedShots: number;
  newShots: number;
  /** Header names set to "Don't import". */
  skippedColumns: string[];
};

const HEADING_FIELDS = ["indicator", "location", "time"] as const;
const INHERITED: Partial<Record<ImportField, keyof ShotOwn>> = {
  movement: "movement",
  system: "system",
  camera: "cameras",
  lens: "cameras",
  audio: "audio",
  fps: "fps",
  sync: "sync",
  date: "date",
};

/** The part of a shot ID after the scene number: "1A" → "A", "1.2" → "2", "B" → "B". */
function shotKey(text: string, sceneNumber: number): string {
  const t = text.trim().toUpperCase();
  const prefix = String(sceneNumber);
  if (t.startsWith(`${prefix}.`)) return t.slice(prefix.length + 1);
  if (t.startsWith(prefix) && /[A-Z]/.test(t.slice(prefix.length))) return t.slice(prefix.length);
  return t;
}

/**
 * Applies the rows to a copy of the project. `mapping` gives each column's
 * field; the first row is the header and is not imported.
 */
export function planImport(project: Project, rows: string[][], mapping: ImportField[], mode: ImportMode): ImportPlan {
  const header = rows[0] ?? [];
  const body = rows.slice(1);
  const col = (field: ImportField) => mapping.indexOf(field);
  let next = project;
  let newScenes = 0;
  let updatedShots = 0;
  let newShots = 0;
  let sceneIndex = -1;

  const sceneCol = col("scene");
  const shotCol = col("shot");
  for (const row of body) {
    const cell = (field: ImportField) => {
      const i = col(field);
      return i >= 0 ? (row[i] ?? "").trim() : "";
    };
    const heading: Partial<SceneHeading> = {};
    for (const f of HEADING_FIELDS) if (cell(f)) heading[f] = cell(f);

    // Which scene: a number, a slugline, or the scene above when blank.
    const sceneText = sceneCol >= 0 ? (row[sceneCol] ?? "").trim() : "";
    if (sceneText) {
      const number = /^\d+/.exec(sceneText);
      if (number) sceneIndex = Number(number[0]) - 1;
      else {
        const parsed = parseSceneHeading(sceneText)?.heading;
        const wanted = norm(sceneText);
        const found = next.scenes.findIndex(
          (s) => norm([s.heading.indicator, s.heading.location].filter(Boolean).join(" ") + (s.heading.time ? ` - ${s.heading.time}` : "")) === wanted
        );
        if (found >= 0) sceneIndex = found;
        else {
          sceneIndex = next.scenes.length;
          if (parsed) Object.assign(heading, { ...parsed, ...heading });
          else heading.location ??= sceneText;
        }
      }
    } else if (sceneIndex < 0) sceneIndex = Math.max(0, next.scenes.length - 1);
    // Make any scenes the number needs; a new scene takes the row's heading.
    while (next.scenes.length <= sceneIndex) {
      next = edits.addScene(createScene())(next);
      newScenes += 1;
    }
    const scene = next.scenes[sceneIndex]!;
    const blankHeading = !scene.heading.indicator && !scene.heading.location && !scene.heading.time;
    if (blankHeading && Object.keys(heading).length) {
      next = edits.updateScene(scene.id, (s) => ({ ...s, heading: { ...s.heading, ...heading } }))(next);
    }

    // Which shot: the same ID in this scene when updating, else a new one.
    const style = next.settings.general.shotIdStyle;
    const key = shotCol >= 0 ? shotKey(row[shotCol] ?? "", sceneIndex + 1) : "";
    let shot: Shot | undefined;
    if (mode === "update" && key) {
      const current = next.scenes[sceneIndex]!;
      const index = current.shots.findIndex((_, i) => shotKey(shotIdLabel(sceneIndex, i, style), sceneIndex + 1) === key);
      if (index >= 0) shot = current.shots[index];
    }
    const rowHasShotData = mapping.some((f, i) => f !== "skip" && f !== "scene" && !HEADING_FIELDS.includes(f as never) && (row[i] ?? "").trim());
    if (!shot) {
      // A row with only scene cells adds a scene, not an empty shot.
      if (!rowHasShotData && !key) continue;
      shot = createShot(next);
      next = edits.addShot(next.scenes[sceneIndex]!.id, shot)(next);
      newShots += 1;
    } else updatedShots += 1;
    const shotId = shot.id;

    mapping.forEach((field, i) => {
      const text = (row[i] ?? "").trim();
      if (field === "skip" || field === "scene" || field === "shot" || !text) return;
      const found = edits.findShot(next, shotId);
      if (!found) return;
      if (HEADING_FIELDS.includes(field as (typeof HEADING_FIELDS)[number])) {
        // A heading cell that differs from the scene becomes the shot's own value.
        const f = field as (typeof HEADING_FIELDS)[number];
        if (norm(found.scene.heading[f]) !== norm(text)) next = edits.setShotOwn(shotId, f, text)(next);
        return;
      }
      if (field === "color") {
        if (/^#?[0-9a-f]{6}$/i.test(text)) next = edits.updateShot(shotId, (s) => ({ ...s, color: text.startsWith("#") ? text : `#${text}` }))(next);
        return;
      }
      const column = TABLE_COLUMNS.find((c) => c.id === field);
      if (!column?.write) return;
      const value = field === "status" || field === "priority" ? choiceWord(field, text) : text;
      // A value the same as the scene's stays inherited.
      const ownKey = INHERITED[field];
      if (ownKey) {
        const fresh = { ...found.shot };
        delete fresh.own;
        if (norm(column.read(next, found.scene, fresh).text) === norm(value)) return;
      }
      next = column.write(next, found.shot, value)(next);
    });
  }

  const skippedColumns = header.filter((_, i) => mapping[i] === "skip" && header[i]!.trim());
  return { project: next, newScenes, updatedShots, newShots, skippedColumns };
}
