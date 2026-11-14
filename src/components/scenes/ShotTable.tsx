/*
 * The shot list as a table: the Scenes panel widened over the script. Same
 * shots in the same order, under foldable scene rows. Cells edit in place and
 * take blocks pasted from a spreadsheet.
 */
import { sceneNumber } from "../../model/numbering";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { ArrowDown, CalendarDays, ChevronDown, Minus, ChevronRight, Circle, Columns3, Plus, RotateCcw, Search, Star, Check, X } from "lucide-react";
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
  groupByDate,
  moveColumn,
  orderColumns,
  TABLE_COLUMNS,
  tableRows,
  type TableColumn,
  type TableFilter,
} from "../../model/shotTable";
import { formatExcelDate } from "../../lib/dateFormat";
import type { Scene, Shot } from "../../model/types";
import { breakUndoGroup, useProjectStore } from "../../stores/projectStore";
import { TABLE_ZOOM_MAX, TABLE_ZOOM_MIN, usePrefsStore } from "../../stores/prefsStore";
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

  const order = usePrefsStore((s) => s.tableColumnOrder);
  const tracking = !!project.settings.revisions?.enabled;
  const ordered = useMemo(() => orderColumns(tracking ? TABLE_COLUMNS : TABLE_COLUMNS.filter((c) => c.id !== "revision"), order), [order, tracking]);
  const columns = useMemo(() => ordered.filter((c) => c.id === "shot" || !hidden.includes(c.id)), [ordered, hidden]);
  const widths = usePrefsStore((s) => s.tableColumnWidths);
  const zoom = usePrefsStore((s) => s.tableZoom);
  const widthOf = (c: TableColumn) => widths[c.id] ?? c.width;
  const setZoom = (z: number) => usePrefsStore.getState().setTableZoom(z);
  // Header being dragged, and where it would land.
  const [dragCol, setDragCol] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ id: string; after: boolean } | null>(null);
  const rows = useMemo(
    () =>
      tableRows(project, search, filters, columns)
        .filter((r) => !hiddenRows.includes(r.scene.id))
        .map((r) => ({ ...r, shots: r.shots.filter((shot) => !hiddenRows.includes(shot.id)) })),
    [project, search, filters, columns, hiddenRows]
  );
  const hiddenCount = hiddenRows.length + hidden.length;
  const groupBy = usePrefsStore((s) => s.tableGroupBy);
  const dateGroups = useMemo(() => (groupBy === "date" ? groupByDate(rows) : []), [groupBy, rows]);
  const [foldedDates, setFoldedDates] = useState<Record<string, boolean>>({});

  const searching = search.trim() !== "";
  // Shots in the order they show, for keyboard moves and pasting.
  const shownShots =
    groupBy === "date"
      ? dateGroups.flatMap((g) => (searching || !foldedDates[g.date] ? g.items.map((i) => i.shot) : []))
      : rows.flatMap((r) => (searching || !collapsed[r.scene.id] ? r.shots : []));
  const shownIds = shownShots.map((s) => s.id);
  // A selected line or note highlights its shot's row.
  const selectedMark = selection?.kind === "mark" ? edits.findMark(project, selection.ids[0]) : undefined;
  const selectedShotId = selection?.kind === "shot" ? selection.ids[0] : selectedMark ? edits.markShotId(selectedMark) : undefined;

  // Ctrl+scroll zooms the table instead of the page.
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const z = usePrefsStore.getState().tableZoom;
      usePrefsStore.getState().setTableZoom(z + (e.deltaY < 0 ? 0.1 : -0.1));
    };
    grid.addEventListener("wheel", onWheel, { passive: false });
    return () => grid.removeEventListener("wheel", onWheel);
  }, []);

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

  /** Moves a column before or after another; the order covers hidden columns too. */
  const placeColumn = (id: string, target: string, after: boolean) =>
    usePrefsStore.getState().setTableColumnOrder(moveColumn(ordered.slice(1).map((c) => c.id), id, target, after));
  const shiftColumn = (column: TableColumn, by: -1 | 1) => {
    const next = columns[columns.indexOf(column) + by];
    if (next && next.id !== "shot") placeColumn(column.id, next.id, by > 0);
  };
  const headerMenu = (e: React.MouseEvent, column: TableColumn) => {
    const at = columns.indexOf(column);
    openContextMenu(e, [
      { label: "Normal width", disabled: widths[column.id] === undefined, onSelect: () => usePrefsStore.getState().setTableColumnWidth(column.id, null) },
      { label: "Reset all column widths", disabled: Object.keys(widths).length === 0, onSelect: () => Object.keys(widths).forEach((id) => usePrefsStore.getState().setTableColumnWidth(id, null)) },
      "separator",
      { label: "Move left", disabled: column.id === "shot" || at <= 1, onSelect: () => shiftColumn(column, -1) },
      { label: "Move right", disabled: column.id === "shot" || at >= columns.length - 1, onSelect: () => shiftColumn(column, 1) },
      { label: "Reset column order", disabled: order.length === 0, onSelect: () => usePrefsStore.getState().setTableColumnOrder([]) },
      "separator",
      { label: `Hide column "${column.label}"`, disabled: column.id === "shot", onSelect: () => hideColumn(column) },
      SHOW_ALL,
    ]);
  };
  // Drag a header onto another to move it; the Shot column stays first.
  const dropSide = (e: React.DragEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientX > r.left + r.width / 2;
  };
  const endDrag = () => {
    setDragCol(null);
    setDropAt(null);
  };
  const headerDrag = (c: TableColumn) =>
    c.id === "shot"
      ? {}
      : {
          draggable: true,
          onDragStart: (e: React.DragEvent<HTMLElement>) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/x-table-column", c.id);
            setDragCol(c.id);
          },
          onDragEnd: endDrag,
        };
  const headerDrop = (c: TableColumn) => ({
    onDragOver: (e: React.DragEvent<HTMLElement>) => {
      if (!dragCol) return;
      e.preventDefault();
      const after = c.id === "shot" ? true : dropSide(e);
      if (dropAt?.id !== c.id || dropAt.after !== after) setDropAt({ id: c.id, after });
    },
    onDrop: (e: React.DragEvent<HTMLElement>) => {
      if (!dragCol) return;
      e.preventDefault();
      if (c.id === "shot") {
        const first = columns[1];
        if (first) placeColumn(dragCol, first.id, false);
      } else placeColumn(dragCol, c.id, dropSide(e));
      endDrag();
    },
  });

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
      { label: "Go to scene on script", onSelect: () => void commands.jumpToScene(sceneId) },
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
    if ((e.ctrlKey || e.metaKey) && ["=", "+", "-", "0"].includes(e.key)) {
      own();
      setZoom(e.key === "0" ? 1 : zoom + (e.key === "-" ? -0.1 : 0.1));
      return;
    }
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
  const width = columns.reduce((n, c) => n + widthOf(c), 0);

  /** Dragging a header's right edge sets that column's width; a double-click puts it back. */
  const startResize = (e: React.PointerEvent<HTMLElement>, c: TableColumn) => {
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const startX = e.clientX;
    const start = widthOf(c);
    const onMove = (ev: PointerEvent) => {
      const next = Math.max(2, Math.round((start + (ev.clientX - startX) / (rem * zoom)) * 8) / 8);
      usePrefsStore.getState().setTableColumnWidth(c.id, next);
    };
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  };

  const shotRow = (scene: Scene, shot: Shot) => (
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
  );

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
        <label className="table-group" title="Group rows by scene or by scheduled date">
          <CalendarDays size={14} strokeWidth={1.75} aria-hidden="true" />
          <select aria-label="Group rows by" value={groupBy} onChange={(e) => usePrefsStore.getState().setTableGroupBy(e.target.value as "scene" | "date")}>
            <option value="scene">By scene</option>
            <option value="date">By date</option>
          </select>
        </label>
        <Dropdown.Root modal={false}>
          <Dropdown.Trigger className="tool-btn">
            <Columns3 size={14} strokeWidth={1.75} /> Columns · {columns.length}
          </Dropdown.Trigger>
          <Dropdown.Portal>
            <Dropdown.Content className="menu" align="end" sideOffset={4}>
              {ordered.filter((c) => c.id !== "shot").map((c) => (
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
        <button type="button" className="tool-btn" onClick={commands.requestExportShotListPdf}>
          Export PDF…
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
        <table style={{ width: `${width}rem`, zoom }}>
          <colgroup>
            {columns.map((c) => (
              <col key={c.id} style={{ width: `${widthOf(c)}rem` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.id}
                  scope="col"
                  className={[
                    c.id === "shot" ? "pin" : "th-move",
                    dragCol === c.id ? "th-dragging" : "",
                    dropAt?.id === c.id && dragCol !== c.id ? (dropAt.after ? "th-drop-after" : "th-drop-before") : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  title={c.id === "shot" ? undefined : "Drag to move this column"}
                  onContextMenu={(e) => headerMenu(e, c)}
                  {...headerDrag(c)}
                  {...headerDrop(c)}
                >
                  {c.label}
                  <span
                    className="th-resize"
                    title="Drag to resize · double-click for the normal width"
                    draggable={false}
                    onPointerDown={(e) => startResize(e, c)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      usePrefsStore.getState().setTableColumnWidth(c.id, null);
                    }}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groupBy === "date" &&
              dateGroups.map((g) => {
                const folded = !searching && !!foldedDates[g.date];
                const ids = g.items.map((i) => i.shot.id);
                const length = sceneLength(project, ids);
                const minutes = g.items.reduce((n, i) => n + (i.shot.estimatedMinutes ?? 0), 0);
                const Fold = folded ? ChevronRight : ChevronDown;
                const label = g.date ? formatExcelDate(g.date, project.settings.captions.dateFormat) || g.date : "No date";
                return [
                  <tr key={`date:${g.date}`} className="table-scene table-date">
                    <th className="pin" scope="row">
                      <button type="button" className="table-fold" aria-label={folded ? `Expand ${label}` : `Collapse ${label}`} onClick={() => setFoldedDates({ ...foldedDates, [g.date]: !folded })}>
                        <Fold size={13} strokeWidth={1.75} />
                      </button>
                    </th>
                    <td colSpan={columns.length - 1}>
                      <span className="table-slug">{label}</span>
                      <span className="table-scene-meta">
                        {g.items.length} {g.items.length === 1 ? "shot" : "shots"}
                        {minutes ? ` · Est. ${formatMinutes(minutes)}` : ""}
                        {length.lineCount ? ` · ${formatEighths(length.eighths)} pgs` : ""}
                      </span>
                    </td>
                  </tr>,
                  ...(folded ? [] : g.items.map((i) => shotRow(i.scene, i.shot))),
                ];
              })}
            {groupBy === "scene" && rows.map(({ scene, sceneIndex, shots }) => {
              if (searching && shots.length === 0) return null;
              const folded = !searching && !!collapsed[scene.id];
              const length = sceneLength(project, scene.shots.map((s) => s.id));
              const minutes = scene.shots.reduce((n, s) => n + (s.estimatedMinutes ?? 0), 0);
              const Fold = folded ? ChevronRight : ChevronDown;
              return [
                <tr key={scene.id} onContextMenu={(e) => sceneMenu(e, scene.id)} className={`table-scene${selection?.kind === "scene" && selection.ids[0] === scene.id ? " selected" : ""}`}>
                  <th className="pin" scope="row">
                    <button type="button" className="table-fold" aria-label={folded ? `Expand scene ${sceneNumber(project, sceneIndex)}` : `Collapse scene ${sceneNumber(project, sceneIndex)}`} onClick={() => session().setSceneCollapsed(scene.id, !folded)}>
                      <Fold size={13} strokeWidth={1.75} />
                    </button>
                    {sceneNumber(project, sceneIndex)}
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
                  : shots.map((shot) => shotRow(scene, shot))),
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
        <span className="table-zoom">
          <button type="button" className="table-zoom-btn" aria-label="Zoom out" title="Zoom out (Ctrl+scroll)" disabled={zoom <= TABLE_ZOOM_MIN} onClick={() => setZoom(zoom - 0.1)}>
            <Minus size={12} strokeWidth={2} />
          </button>
          <button type="button" className="table-zoom-value" title="Reset zoom to 100%" onClick={() => setZoom(1)}>
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" className="table-zoom-btn" aria-label="Zoom in" title="Zoom in (Ctrl+scroll)" disabled={zoom >= TABLE_ZOOM_MAX} onClick={() => setZoom(zoom + 0.1)}>
            <Plus size={12} strokeWidth={2} />
          </button>
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
