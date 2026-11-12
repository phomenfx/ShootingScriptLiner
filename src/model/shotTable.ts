/*
 * The shot-list table: its columns, how each cell reads and writes, pasting a
 * block of cells, and filters. Columns match the CSV export.
 */
import { cameraNames, effectiveShot } from "./captions";
import * as edits from "./edits";
import { formatEighths, formatPageRange, shotLength } from "./pageLength";
import { choiceEntries, choiceLabel, keyForText } from "./registry";
import { shotIdLabel } from "./shotList";
import type { CameraRow, ListEntry, Project, Scene, Shot, ShotOwn } from "./types";

export type CellValue = {
  text: string;
  /** Shown dim and italic: the value comes from the scene. */
  inherited?: boolean;
  /** Shown as chips. */
  chips?: string[];
};

export type TableColumn = {
  id: string;
  label: string;
  /** Width in rem. */
  width: number;
  /** Read-only cells cannot be typed in or pasted into. */
  readOnly?: boolean;
  /** Cycles on click instead of opening an editor. */
  cycles?: "status" | "priority";
  read: (project: Project, scene: Scene, shot: Shot) => CellValue;
  /** The edit for typed or pasted text. Empty text clears the shot's own value. */
  write?: (project: Project, shot: Shot, text: string) => edits.Edit;
};

const SEP = "; ";
const LENS_SEP = " + ";
const splitList = (text: string) =>
  text
    .split(/[;\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
const joined = (values: string[] | undefined) => (values ?? []).filter(Boolean).join(SEP);

/** Sets a shot field; empty text removes it. */
const setField =
  <K extends keyof Shot>(key: K, value: Shot[K] | undefined) =>
  (shotId: string): edits.Edit =>
    edits.updateShot(shotId, (shot) => {
      const next = { ...shot };
      if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) delete next[key];
      else next[key] = value;
      return next;
    });

/** A plain text field on the shot. */
function textColumn(id: keyof Shot & string, label: string, width: number): TableColumn {
  return {
    id,
    label,
    width,
    read: (_p, _scene, shot) => ({ text: String(shot[id] ?? "").trim() }),
    write: (_p, shot, text) => setField(id, text.trim() as Shot[typeof id])(shot.id),
  };
}

/** A field the shot takes from its scene unless it has its own. */
function inheritedColumn<K extends keyof ShotOwn>(
  id: K,
  label: string,
  width: number,
  show: (value: NonNullable<ShotOwn[K]> | undefined, project: Project) => string,
  parse: (text: string, project: Project, current: NonNullable<ShotOwn[K]> | undefined) => NonNullable<ShotOwn[K]>,
  asChips = false
): TableColumn {
  return {
    id,
    label,
    width,
    read: (project, scene, shot) => {
      const e = effectiveShot(scene, shot) as Record<string, unknown>;
      const value = e[id] as NonNullable<ShotOwn[K]> | undefined;
      const text = show(value, project);
      const inherited = shot.own?.[id] === undefined;
      return asChips && Array.isArray(value) ? { text, inherited, chips: value as string[] } : { text, inherited };
    },
    write: (project, shot, text) => {
      const found = edits.findShot(project, shot.id);
      const current = found ? (effectiveShot(found.scene, shot) as Record<string, unknown>)[id] : undefined;
      return edits.setShotOwn(shot.id, id, text.trim() ? parse(text, project, current as NonNullable<ShotOwn[K]> | undefined) : undefined);
    },
  };
}

/** Typed labels become choice keys; new tags join the project's list. */
function tagEdit(project: Project, shot: Shot, text: string): edits.Edit {
  const known: ListEntry[] = project.settings.lists.tags ?? [];
  const added = [...known];
  const keys = splitList(text).map((label) => {
    const hit = added.find((tag) => tag.key === label || tag.label.toLowerCase() === label.toLowerCase());
    if (hit) return hit.key;
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tag";
    const tag = { key: `custom:${slug}`, label };
    added.push(tag);
    return tag.key;
  });
  const setTags = setField("tags", [...new Set(keys)])(shot.id);
  if (added.length === known.length) return setTags;
  return (p) => setTags(edits.updateSettings((s) => ({ ...s, lists: { ...s.lists, tags: added } }))(p));
}

/** A status or priority from its label or key; unknown text leaves it as it was. */
function choiceEdit(field: "status" | "priority", project: Project, shot: Shot, text: string): edits.Edit {
  const wanted = text.trim().toLowerCase();
  const hit = choiceEntries(field, project.settings.lists).find((e) => e.key.toLowerCase() === wanted || e.label.toLowerCase() === wanted);
  return hit ? edits.updateShot(shot.id, (s) => ({ ...s, [field]: hit.key })) : (p) => p;
}

/** "20", "20m", "1h", "1h 10m" → minutes. */
export function parseMinutes(text: string): number | undefined {
  const t = text.trim().toLowerCase();
  if (!t) return undefined;
  const h = /(\d+(?:\.\d+)?)\s*h/.exec(t);
  const m = /(\d+(?:\.\d+)?)\s*m/.exec(t);
  if (h || m) return Math.round((h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0));
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
}

export function formatMinutes(minutes: number | undefined): string {
  if (minutes === undefined) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}

/** Camera names typed as "A; B". Each row keeps its lenses by position. */
function camerasFromNames(text: string, current: CameraRow[] = []): CameraRow[] {
  return splitList(text).map((name, i) => ({ name, lenses: current[i]?.lenses ?? [] }));
}

/** Lenses typed as "35mm + 50mm; 85mm": one group per camera, by position. */
function camerasFromLenses(text: string, current: CameraRow[] = []): CameraRow[] {
  const groups = text.split(";").map((g) => g.split("+").map((l) => l.trim()).filter(Boolean));
  const count = Math.max(groups.length, current.length);
  return Array.from({ length: count }, (_, i) => ({ name: current[i]?.name ?? "", lenses: groups[i] ?? [] })).filter(
    (row) => row.name || row.lenses.length > 0
  );
}

export const TABLE_COLUMNS: TableColumn[] = [
  {
    id: "shot",
    label: "Shot",
    width: 4.5,
    readOnly: true,
    read: (project, scene, shot) => {
      const sceneIndex = project.scenes.indexOf(scene);
      return { text: shotIdLabel(sceneIndex, scene.shots.indexOf(shot), project.settings.general.shotIdStyle) };
    },
  },
  {
    id: "status",
    label: "Status",
    width: 6.5,
    cycles: "status",
    read: (p, _s, shot) => ({ text: choiceLabel("status", shot.status, p.settings.lists) }),
    write: (p, shot, text) => choiceEdit("status", p, shot, text),
  },
  {
    id: "priority",
    label: "Priority",
    width: 7.5,
    cycles: "priority",
    read: (p, _s, shot) => ({ text: choiceLabel("priority", shot.priority, p.settings.lists) }),
    write: (p, shot, text) => choiceEdit("priority", p, shot, text),
  },
  textColumn("type", "Size", 3.5),
  {
    id: "angle",
    label: "Angle",
    width: 7,
    read: (p, _s, shot) => ({ text: choiceLabel("angle", shot.angle, p.settings.lists) }),
    write: (p, shot, text) => setField("angle", keyForText("angle", text, p.settings.lists))(shot.id),
  },
  textColumn("subject", "Subject", 7),
  {
    id: "cast",
    label: "Cast",
    width: 8,
    read: (_p, _s, shot) => ({ text: joined(shot.cast), chips: shot.cast ?? [] }),
    write: (_p, shot, text) => setField("cast", splitList(text))(shot.id),
  },
  textColumn("additionalInfo", "Additional info", 8),
  {
    id: "tags",
    label: "Tags",
    width: 8,
    read: (p, _s, shot) => {
      const labels = (shot.tags ?? []).map((tag) => choiceLabel("tags", tag, p.settings.lists));
      return { text: joined(labels), chips: labels };
    },
    write: tagEdit,
  },
  textColumn("setup", "Setup", 4),
  {
    id: "estimatedMinutes",
    label: "Est. time",
    width: 5,
    read: (_p, _s, shot) => ({ text: formatMinutes(shot.estimatedMinutes) }),
    write: (_p, shot, text) => setField("estimatedMinutes", parseMinutes(text))(shot.id),
  },
  inheritedColumn("movement", "Movement", 7, (v) => joined(v), (t) => splitList(t), true),
  { ...inheritedColumn("cameras", "Camera", 5, (v) => joined(cameraNames(v ?? [])), (t, _p, cur) => camerasFromNames(t, cur)), id: "camera" },
  {
    ...inheritedColumn(
      "cameras",
      "Lens",
      7,
      (v) => (v ?? []).map((row) => row.lenses.join(LENS_SEP)).filter(Boolean).join(SEP),
      (t, _p, cur) => camerasFromLenses(t, cur)
    ),
    id: "lens",
  },
  inheritedColumn("audio", "Audio", 6, (v) => joined(v), (t) => splitList(t), true),
  inheritedColumn("fps", "FPS", 3.5, (v) => v ?? "", (t) => t.trim()),
  inheritedColumn(
    "sync",
    "Sync",
    4.5,
    (v, p) => choiceLabel("sync", v, p.settings.lists),
    (t, p) => keyForText("sync", t, p.settings.lists)
  ),
  inheritedColumn("date", "Date", 6.5, (v) => v ?? "", (t) => t.trim()),
  textColumn("notes", "Notes", 10),
  {
    id: "pages",
    label: "Pages",
    width: 4.5,
    readOnly: true,
    read: (p, _s, shot) => ({ text: formatPageRange(shotLength(p, shot.id).pages).replace(/^pages? /, "") }),
  },
  {
    id: "eighths",
    label: "Eighths",
    width: 4.5,
    readOnly: true,
    read: (p, _s, shot) => {
      const length = shotLength(p, shot.id);
      return { text: length.lineCount > 0 ? formatEighths(length.eighths) : "" };
    },
  },
  {
    id: "lines",
    label: "Lines",
    width: 3.5,
    readOnly: true,
    read: (p, _s, shot) => ({ text: String(shotLength(p, shot.id).lineCount) }),
  },
];

export const DEFAULT_HIDDEN_COLUMNS: string[] = [];

/* ---------- filters ---------- */

export type TableFilter = { field: "status" | "priority"; not: boolean; value: string };

export function filterLabel(project: Project, filter: TableFilter): string {
  const field = filter.field === "status" ? "Status" : "Priority";
  return `${field}: ${filter.not ? "not " : ""}${choiceLabel(filter.field, filter.value, project.settings.lists)}`;
}

/** A shot passes when it meets every filter. */
export function passesFilters(shot: Shot, filters: TableFilter[]): boolean {
  return filters.every((f) => (shot[f.field] === f.value) !== f.not);
}

/* ---------- rows ---------- */

export type TableScene = { scene: Scene; sceneIndex: number; shots: Shot[]; hiddenByFilter: number };

/** Scenes in order with the shots that pass the search and filters. */
export function tableRows(project: Project, search: string, filters: TableFilter[], columns: TableColumn[]): TableScene[] {
  const needle = search.trim().toLowerCase();
  return project.scenes.map((scene, sceneIndex) => {
    const heading = `${sceneIndex + 1} ${scene.heading.indicator} ${scene.heading.location} ${scene.heading.time}`.toLowerCase();
    const filtered = scene.shots.filter((shot) => passesFilters(shot, filters));
    const shots = needle && !heading.includes(needle)
      ? filtered.filter((shot) => columns.some((c) => c.read(project, scene, shot).text.toLowerCase().includes(needle)))
      : filtered;
    return { scene, sceneIndex, shots, hiddenByFilter: scene.shots.length - filtered.length };
  });
}

/* ---------- pasting ---------- */

/** Cells from a spreadsheet: tab-separated rows, with quoted cells allowed. */
export function parseCellBlock(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const clean = text.replace(/\r\n?/g, "\n").replace(/\n$/, "");
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i]!;
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

/**
 * Fills cells from the anchor rightward and downward over the shown rows and
 * columns. Read-only columns are skipped over (their pasted value is dropped);
 * rows never get added. One combined edit, so it undoes in one step.
 */
export function pasteBlock(
  block: string[][],
  shotIds: string[],
  columns: TableColumn[],
  anchor: { shotId: string; columnId: string }
): edits.Edit {
  const startRow = shotIds.indexOf(anchor.shotId);
  const startCol = columns.findIndex((c) => c.id === anchor.columnId);
  if (startRow < 0 || startCol < 0) return (p) => p;
  return (current) => {
    let next = current;
    block.forEach((cells, r) => {
      const shotId = shotIds[startRow + r];
      if (!shotId) return;
      cells.forEach((text, c) => {
        const column = columns[startCol + c];
        if (!column?.write || column.readOnly) return;
        const found = edits.findShot(next, shotId);
        if (!found) return;
        next = column.write(next, found.shot, text)(next);
      });
    });
    return next;
  };
}
