/*
 * The shot list as a table: the Scenes panel widened over the script. Same
 * shots in the same order, under foldable scene rows. Cells edit in place and
 * take blocks pasted from a spreadsheet.
 */
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { ArrowDown, ChevronDown, ChevronRight, Circle, Columns3, Plus, RotateCcw, Search, Star, Check, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import * as commands from "../../commands";
import { openContextMenu, type ContextMenuItem } from "../ContextMenu";
import { createScene, createShot } from "../../model/defaults";
import * as edits from "../../model/edits";
import { formatEighths, sceneLength } from "../../model/pageLength";
import { choiceEntries } from "../../model/registry";
import { nextPriority, nextStatus } from "../../model/shotList";
import {
  filterLabel,
  formatMinutes,
  parseCellBlock,
  pasteBlock,
  TABLE_COLUMNS,
  tableRows,
  type TableColumn,
  type TableFilter,
} from "../../model/shotTable";
import type { Shot } from "../../model/types";
import { breakUndoGroup, useProjectStore } from "../../stores/projectStore";
import { usePrefsStore } from "../../stores/prefsStore";
import { useSessionStore } from "../../stores/sessionStore";

type Cell = { shotId: string; columnId: string };

const session = () => useSessionStore.getState();
function step(edit: edits.Edit) {
  breakUndoGroup();
  useProjectStore.getState().apply(edit);
  breakUndoGroup();
}

const STATUS_ICON: Record<string, typeof Check> = { shot: Check, pickup: RotateCcw, cut: X };
const PRIORITY_ICON: Record<string, typeof Check> = { must: Star, low: ArrowDown };

export function ShotTable() {
  const project = useProjectStore((s) => s.project);
  const selection = useSessionStore((s) => s.selection);
  const collapsed = useSessionStore((s) => s.collapsedSceneIds);
  const hidden = usePrefsStore((s) => s.hiddenTableColumns);
  const hiddenRows = useSessionStore((s) => s.hiddenTableRows);
  const setColumnHidden = usePrefsStore((s) => s.setTableColumnHidden);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<TableFilter[]>([]);
  const [active, setActive] = useState<Cell | null>(null);
  const [editing, setEditing] = useState<{ cell: Cell; text: string } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const columns = useMemo(() => TABLE_COLUMNS.filter((c) => c.id === "shot" || !hidden.includes(c.id)), [hidden]);
  const rows = useMemo(
    () =>
      tableRows(project, search, filters, columns)
        .filter((r) => !hiddenRows.includes(r.scene.id))
        .map((r) => ({ ...r, shots: r.shots.filter((shot) => !hiddenRows.includes(shot.id)) })),
    [project, search, filters, columns, hiddenRows]
  );
  const hiddenCount = hiddenRows.length + hidden.length;

  const searching = search.trim() !== "";
  // Shots in the order they show, for keyboard moves and pasting.
  const shownShots = rows.flatMap((r) => (searching || !collapsed[r.scene.id] ? r.shots : []));
  const shownIds = shownShots.map((s) => s.id);
  // A selected line or note highlights its shot's row.
  const selectedMark = selection?.kind === "mark" ? edits.findMark(project, selection.ids[0]) : undefined;
  const selectedShotId = selection?.kind === "shot" ? selection.ids[0] : selectedMark ? edits.markShotId(selectedMark) : undefined;

  // Selecting a shot elsewhere moves the active cell to its row.
  useEffect(() => {
    if (selectedShotId && active?.shotId !== selectedShotId && shownIds.includes(selectedShotId)) {
      setActive({ shotId: selectedShotId, columnId: active?.columnId ?? "shot" });
    }
  }, [selectedShotId]); // eslint-disable-line react-hooks/exhaustive-deps

  const columnOf = (id: string) => columns.find((c) => c.id === id);
  const showAll = () => commands.showAllHidden();
  const hideColumn = (column: TableColumn) => column.id !== "shot" && usePrefsStore.getState().setTableColumnHidden(column.id, true);
  const SHOW_ALL: ContextMenuItem = { label: "Show everything hidden", shortcut: "Alt+H", onSelect: showAll };

  const cellMenu = (e: React.MouseEvent, shot: Shot, column: TableColumn) => {
    const cell = { shotId: shot.id, columnId: column.id };
    activate(cell);
    const found = shotOf(shot.id);
    const value = found ? column.read(project, found.scene, found.shot).text : "";
    const editable = !!column.write && !column.readOnly && !column.cycles;
    openContextMenu(e, [
      { label: "Copy cell", shortcut: "Ctrl+C", onSelect: () => void navigator.clipboard?.writeText(value) },
      {
        label: "Paste",
        shortcut: "Ctrl+V",
        disabled: !column.write || column.readOnly,
        onSelect: () =>
          void navigator.clipboard?.readText().then((text) => text && step(pasteBlock(parseCellBlock(text), shownIds, columns, cell))),
      },
      { label: "Clear cell", shortcut: "Del", disabled: !editable, onSelect: () => found && step(column.write!(project, found.shot, "")) },
      "separator",
      { label: "Hide row", onSelect: () => session().hideTableRow(shot.id) },
      { label: `Hide column "${column.label}"`, disabled: column.id === "shot", onSelect: () => hideColumn(column) },
      SHOW_ALL,
      "separator",
      { label: "Show on script", onSelect: () => commands.jumpToShot(shot.id) },
      { label: "Hide shot on the script", shortcut: "Ctrl+H", onSelect: commands.hideSelectedShot },
      { label: "Duplicate shot", shortcut: "Ctrl+D", onSelect: () => commands.duplicateSelection() },
      { label: "Delete shot", danger: true, onSelect: () => commands.deleteSelection() },
    ]);
  };

  const headerMenu = (e: React.MouseEvent, column: TableColumn) =>
    openContextMenu(e, [{ label: `Hide column "${column.label}"`, disabled: column.id === "shot", onSelect: () => hideColumn(column) }, SHOW_ALL]);

  const sceneMenu = (e: React.MouseEvent, sceneId: string) => {
    session().select("scene", sceneId);
    openContextMenu(e, [
      {
        label: "Add shot here",
        onSelect: () => {
          const shot = createShot(project);
          step(edits.addShot(sceneId, shot));
          session().setSceneCollapsed(sceneId, false);
          session().select("shot", shot.id);
        },
      },
      "separator",
      { label: "Hide scene rows", onSelect: () => session().hideTableRow(sceneId) },
      { label: "Hide scene on the script", shortcut: "Ctrl+Shift+H", onSelect: commands.hideSelectedScene },
      SHOW_ALL,
      "separator",
      { label: "Duplicate scene", shortcut: "Ctrl+D", onSelect: () => commands.duplicateSelection() },
      { label: "Delete scene", danger: true, onSelect: () => commands.deleteSelection() },
    ]);
  };
  const shotOf = (id: string) => edits.findShot(project, id);

  const activate = (cell: Cell) => {
    setActive(cell);
    if (selection?.kind !== "shot" || selection.ids[0] !== cell.shotId) session().select("shot", cell.shotId);
    gridRef.current?.focus({ preventScroll: true });
  };

  const commit = () => {
    if (!editing) return;
    const column = columnOf(editing.cell.columnId);
    const found = shotOf(editing.cell.shotId);
    setEditing(null);
    if (!column?.write || !found) return;
    if (column.read(project, found.scene, found.shot).text === editing.text) return;
    step(column.write(project, found.shot, editing.text));
  };

  const startEdit = (cell: Cell, text?: string) => {
    const column = columnOf(cell.columnId);
    const found = shotOf(cell.shotId);
    if (!column || column.readOnly || column.cycles || !found) return;
    const value = column.read(project, found.scene, found.shot);
    // Inherited values start empty, so typing makes the shot's own value.
    setEditing({ cell, text: text ?? (value.inherited ? "" : value.text) });
  };

  const cycle = (shot: Shot, field: "status" | "priority") =>
    step(
      edits.updateShot(shot.id, (s) => ({
        ...s,
        [field]: field === "status" ? nextStatus(s.status, project.settings.lists) : nextPriority(s.priority, project.settings.lists),
      }))
    );

  const move = (dRow: number, dCol: number) => {
    if (!active) return;
    const r = Math.max(0, Math.min(shownIds.length - 1, shownIds.indexOf(active.shotId) + dRow));
    const c = Math.max(0, Math.min(columns.length - 1, columns.findIndex((col) => col.id === active.columnId) + dCol));
    const cell = { shotId: shownIds[r]!, columnId: columns[c]!.id };
    activate(cell);
    gridRef.current?.querySelector(`[data-cell="${cell.shotId}:${cell.columnId}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };

  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (editing || !active) return;
    // The table handles its own keys; app shortcuts (Delete shot, paste shot) wait.
    const own = () => {
      e.stopPropagation();
      e.preventDefault();
    };
    if (e.ctrlKey || e.metaKey) {
      // Let the browser fire copy and paste on the table, not the app's shot copy.
      if (["c", "v", "x"].includes(e.key.toLowerCase())) e.stopPropagation();
      return;
    }
    const keys: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (keys[e.key]) {
      own();
      move(...keys[e.key]!);
    } else if (e.key === "Tab") {
      own();
      move(0, e.shiftKey ? -1 : 1);
    } else if (e.key === "Enter" || e.key === "F2") {
      own();
      const column = columnOf(active.columnId);
      const found = shotOf(active.shotId);
      if (column?.cycles && found) cycle(found.shot, column.cycles);
      else startEdit(active);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      own();
      const column = columnOf(active.columnId);
      const found = shotOf(active.shotId);
      if (column?.write && !column.readOnly && !column.cycles && found) step(column.write(project, found.shot, ""));
    } else if (e.key === "Escape") {
      own();
      setActive(null);
    } else if (e.key.length === 1 && !e.altKey) {
      own();
      startEdit(active, e.key);
    }
  };

  const onEditorKey = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
      move(1, 0);
    } else if (e.key === "Tab") {
      e.preventDefault();
      commit();
      move(0, e.shiftKey ? -1 : 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditing(null);
      gridRef.current?.focus({ preventScroll: true });
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    if (editing || !active) return;
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    e.preventDefault();
    step(pasteBlock(parseCellBlock(text), shownIds, columns, active));
  };

  const onCopy = (e: React.ClipboardEvent) => {
    if (editing || !active) return;
    const column = columnOf(active.columnId);
    const found = shotOf(active.shotId);
    if (!column || !found) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", column.read(project, found.scene, found.shot).text);
  };

  const addScene = () => {
    const scene = createScene();
    step(edits.addScene(scene));
    session().select("scene", scene.id);
  };
  const targetSceneId = edits.findShot(project, selectedShotId)?.scene.id ?? (selection?.kind === "scene" ? selection.ids[0] : undefined) ?? project.scenes[project.scenes.length - 1]?.id;
  const addShot = () => {
    if (!targetSceneId) return;
    const shot = createShot(project);
    step(edits.addShot(targetSceneId, shot));
    session().setSceneCollapsed(targetSceneId, false);
    session().select("shot", shot.id);
  };

  const filterChoices: TableFilter[] = [
    ...choiceEntries("status", project.settings.lists).map((e) => ({ field: "status" as const, not: true, value: e.key })),
    ...choiceEntries("status", project.settings.lists).map((e) => ({ field: "status" as const, not: false, value: e.key })),
    ...choiceEntries("priority", project.settings.lists).map((e) => ({ field: "priority" as const, not: false, value: e.key })),
  ];
  const sameFilter = (a: TableFilter, b: TableFilter) => a.field === b.field && a.not === b.not && a.value === b.value;

  const totalShots = project.scenes.reduce((n, s) => n + s.shots.length, 0);
  const hiddenByFilter = rows.reduce((n, r) => n + r.hiddenByFilter, 0);
  const allShots = project.scenes.flatMap((s) => s.shots);
  const totalMinutes = allShots.reduce((n, s) => n + (s.estimatedMinutes ?? 0), 0);
  const totalLength = sceneLength(project, allShots.map((s) => s.id));
  const width = columns.reduce((n, c) => n + c.width, 0);

  return (
    <div
      className="shot-table"
      // Dropping a CSV on the table opens Import with it.
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        const file = e.dataTransfer.files[0];
        if (!file || !/\.(csv|tsv|txt)$/i.test(file.name)) return;
        e.preventDefault();
        void file.text().then((text) => {
          session().setImportText({ text, name: file.name });
          session().setImportOpen(true);
        });
      }}
    >
      <div className="shot-table-bar">
        <label className="scene-search">
          <Search size={14} strokeWidth={1.75} aria-hidden="true" />
          <input placeholder="Search shots" aria-label="Search shots" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setSearch("")} />
        </label>
        {filters.map((f) => (
          <span key={`${f.field}-${f.not}-${f.value}`} className="table-chip">
            {filterLabel(project, f)}
            <button type="button" aria-label={`Remove filter ${filterLabel(project, f)}`} onClick={() => setFilters(filters.filter((g) => !sameFilter(g, f)))}>
              <X size={12} strokeWidth={2} />
            </button>
          </span>
        ))}
        <Dropdown.Root modal={false}>
          <Dropdown.Trigger className="tool-btn">
            <Plus size={13} strokeWidth={2} /> Filter
          </Dropdown.Trigger>
          <Dropdown.Portal>
            <Dropdown.Content className="menu" align="start" sideOffset={4}>
              {filterChoices.map((f) => (
                <Dropdown.Item key={`${f.field}-${f.not}-${f.value}`} className="menu-item" disabled={filters.some((g) => sameFilter(g, f))} onSelect={() => setFilters([...filters, f])}>
                  <span className="menu-text">{filterLabel(project, f)}</span>
                </Dropdown.Item>
              ))}
            </Dropdown.Content>
          </Dropdown.Portal>
        </Dropdown.Root>
        <span className="shot-table-spacer" />
        <Dropdown.Root modal={false}>
          <Dropdown.Trigger className="tool-btn">
            <Columns3 size={14} strokeWidth={1.75} /> Columns · {columns.length}
          </Dropdown.Trigger>
          <Dropdown.Portal>
            <Dropdown.Content className="menu" align="end" sideOffset={4}>
              {TABLE_COLUMNS.filter((c) => c.id !== "shot").map((c) => (
                <Dropdown.CheckboxItem
                  key={c.id}
                  className="menu-item"
                  checked={!hidden.includes(c.id)}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(on) => setColumnHidden(c.id, !on)}
                >
                  <span className="menu-mark">{hidden.includes(c.id) ? "" : "✓"}</span>
                  <span className="menu-text">{c.label}</span>
                </Dropdown.CheckboxItem>
              ))}
            </Dropdown.Content>
          </Dropdown.Portal>
        </Dropdown.Root>
        <button type="button" className="tool-btn" onClick={() => session().setImportOpen(true)}>
          Import…
        </button>
        <button type="button" className="tool-btn" onClick={() => void commands.exportShotListCsv()}>
          Export CSV
        </button>
        <button type="button" className="tool-btn" onClick={addScene}>
          <Plus size={13} strokeWidth={2} /> Scene
        </button>
        <button type="button" className="tool-btn" disabled={!targetSceneId} onClick={addShot}>
          <Plus size={13} strokeWidth={2} /> Shot
        </button>
      </div>

      <div
        ref={gridRef}
        className="shot-table-scroll"
        role="grid"
        aria-label="Shot list"
        tabIndex={0}
        onKeyDown={onGridKey}
        onPaste={onPaste}
        onCopy={onCopy}
      >
        <table style={{ width: `${width}rem` }}>
          <colgroup>
            {columns.map((c) => (
              <col key={c.id} style={{ width: `${c.width}rem` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.id} scope="col" className={c.id === "shot" ? "pin" : undefined} onContextMenu={(e) => headerMenu(e, c)}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ scene, sceneIndex, shots }) => {
              if (searching && shots.length === 0) return null;
              const folded = !searching && !!collapsed[scene.id];
              const length = sceneLength(project, scene.shots.map((s) => s.id));
              const minutes = scene.shots.reduce((n, s) => n + (s.estimatedMinutes ?? 0), 0);
              const Fold = folded ? ChevronRight : ChevronDown;
              return [
                <tr key={scene.id} onContextMenu={(e) => sceneMenu(e, scene.id)} className={`table-scene${selection?.kind === "scene" && selection.ids[0] === scene.id ? " selected" : ""}`}>
                  <th className="pin" scope="row">
                    <button type="button" className="table-fold" aria-label={folded ? `Expand scene ${sceneIndex + 1}` : `Collapse scene ${sceneIndex + 1}`} onClick={() => session().setSceneCollapsed(scene.id, !folded)}>
                      <Fold size={13} strokeWidth={1.75} />
                    </button>
                    {sceneIndex + 1}
                  </th>
                  <td colSpan={columns.length - 1} onClick={() => session().select("scene", scene.id)}>
                    <span className="table-slug">
                      {[scene.heading.indicator, scene.heading.location].filter(Boolean).join(" ")}
                      {scene.heading.time ? ` - ${scene.heading.time}` : ""}
                    </span>
                    <span className="table-scene-meta">
                      {folded ? `${scene.shots.length} shots · ` : ""}
                      {minutes ? `Est. ${formatMinutes(minutes)}` : ""}
                      {minutes && length.lineCount ? " · " : ""}
                      {length.lineCount ? `${formatEighths(length.eighths)} pgs` : ""}
                    </span>
                  </td>
                </tr>,
                ...(folded
                  ? []
                  : shots.map((shot) => (
                      <tr key={shot.id} className={`table-shot${shot.id === selectedShotId ? " selected" : ""}${shot.status === "cut" ? " is-cut" : ""}`}>
                        {columns.map((column) => (
                          <TableCell
                            key={column.id}
                            column={column}
                            shot={shot}
                            text={column.read(project, scene, shot)}
                            active={active?.shotId === shot.id && active.columnId === column.id}
                            editing={editing?.cell.shotId === shot.id && editing.cell.columnId === column.id ? editing.text : null}
                            onClick={() => {
                              activate({ shotId: shot.id, columnId: column.id });
                              if (column.cycles) cycle(shot, column.cycles);
                            }}
                            onDoubleClick={() => (column.id === "shot" ? commands.jumpToShot(shot.id) : startEdit({ shotId: shot.id, columnId: column.id }))}
                            onContextMenu={(e) => cellMenu(e, shot, column)}
                            onEditText={(text) => setEditing((e) => (e ? { ...e, text } : e))}
                            onEditKey={onEditorKey}
                            onEditBlur={commit}
                            color={shot.color}
                          />
                        ))}
                      </tr>
                    ))),
              ];
            })}
          </tbody>
        </table>
        {project.scenes.length === 0 && <p className="scene-list-empty">No scenes yet. Add a scene, then add its shots.</p>}
      </div>

      <div className="shot-table-foot">
        <span>
          {project.scenes.length} {project.scenes.length === 1 ? "scene" : "scenes"} · {totalShots} {totalShots === 1 ? "shot" : "shots"}
          {hiddenByFilter > 0 ? ` · ${hiddenByFilter} hidden by filter` : ""}
          {hiddenCount > 0 && (
            <>
              {" · "}
              <button type="button" className="table-foot-link" title="Alt+H" onClick={showAll}>
                {hiddenCount} hidden · show all (Alt+H)
              </button>
            </>
          )}
        </span>
        <span>
          {totalMinutes ? `Est. ${formatMinutes(totalMinutes)}` : ""}
          {totalMinutes && totalLength.lineCount ? " · " : ""}
          {totalLength.lineCount ? `${formatEighths(totalLength.eighths)} pgs` : ""}
        </span>
      </div>
    </div>
  );
}

function TableCell({
  column,
  shot,
  text,
  active,
  editing,
  color,
  onClick,
  onDoubleClick,
  onContextMenu,
  onEditText,
  onEditKey,
  onEditBlur,
}: {
  column: TableColumn;
  shot: Shot;
  text: ReturnType<TableColumn["read"]>;
  active: boolean;
  editing: string | null;
  color: string;
  onClick: () => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onEditText: (text: string) => void;
  onEditKey: (e: KeyboardEvent<HTMLInputElement>) => void;
  onEditBlur: () => void;
}) {
  const className = [
    column.id === "shot" ? "pin" : "",
    active ? "active" : "",
    text.inherited ? "inherited" : "",
    column.readOnly ? "readonly" : "",
  ]
    .filter(Boolean)
    .join(" ");
  let body: React.ReactNode = text.text;
  if (column.id === "shot") {
    body = (
      <>
        <span className="table-dot" style={{ background: color }} />
        {text.text}
      </>
    );
  } else if (column.cycles) {
    const key = column.cycles === "status" ? shot.status : shot.priority;
    const Icon = (column.cycles === "status" ? STATUS_ICON : PRIORITY_ICON)[key] ?? (column.cycles === "status" ? Circle : Star);
    body = (
      <span className={`table-choice ${column.cycles}-${key}`}>
        <Icon size={12} strokeWidth={2} />
        {text.text}
      </span>
    );
  } else if (text.chips && text.chips.length > 0 && !text.inherited) {
    body = text.chips.map((chip, i) => (
      <span key={i} className="table-chip-value">
        {chip}
      </span>
    ));
  }
  return (
    <td className={className} data-cell={`${shot.id}:${column.id}`} onClick={onClick} onDoubleClick={onDoubleClick} onContextMenu={onContextMenu}>
      {editing !== null ? (
        <input
          className="table-editor"
          autoFocus
          value={editing}
          aria-label={column.label}
          onChange={(e) => onEditText(e.target.value)}
          onKeyDown={onEditKey}
          onBlur={onEditBlur}
        />
      ) : (
        body
      )}
    </td>
  );
}
