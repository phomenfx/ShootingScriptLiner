import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown,
  Ban,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Eye,
  EyeOff,
  GripVertical,
  RotateCcw,
  Star,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { choiceLabel } from "../../model/registry";
import type { ListedScene, ListedShot } from "../../model/shotList";
import type { Project, Scene, Shot } from "../../model/types";

const ICON = { size: 14, strokeWidth: 1.75 } as const;

/* ---------- a value that turns into an input ---------- */

type InlineFieldProps = {
  value: string;
  /** Shown dim when the value is empty. */
  placeholder: string;
  label: string;
  editing: boolean;
  /** Scene headings edit with one click; shot fields with a double-click or F2. */
  startOn: "click" | "doubleClick";
  className?: string;
  /** Suggestions offered while typing. */
  suggestions?: string[];
  /** Wraps the shown value, for example "(Moving)". */
  format?: (value: string) => string;
  onStart: () => void;
  onCommit: (value: string) => void;
  /** Called when editing ends; `move` is set when Tab or Shift+Tab was pressed. */
  onEnd: (move?: 1 | -1) => void;
};

function InlineField({
  value,
  placeholder,
  label,
  editing,
  startOn,
  className = "",
  suggestions,
  format,
  onStart,
  onCommit,
  onEnd,
}: InlineFieldProps) {
  const [draft, setDraft] = useState(value);
  const done = useRef(false);
  const listId = suggestions ? `scene-list-${label.replace(/\W+/g, "-")}` : undefined;

  useEffect(() => {
    if (editing) {
      setDraft(value);
      done.current = false;
    }
    // Only when editing starts; later changes to `value` must not reset the draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  if (!editing) {
    const start = (e: React.MouseEvent) => {
      e.stopPropagation();
      onStart();
    };
    return (
      <span
        className={`inline-value ${value ? "" : "inline-empty"} ${className}`}
        title={startOn === "click" ? `${label}: click to edit` : `${label}: double-click or F2 to edit`}
        onClick={startOn === "click" ? start : undefined}
        onDoubleClick={startOn === "doubleClick" ? start : undefined}
      >
        {value ? (format ? format(value) : value) : placeholder}
      </span>
    );
  }

  const finish = (save: boolean, move?: 1 | -1) => {
    if (done.current) return;
    done.current = true;
    if (save && draft !== value) onCommit(draft);
    onEnd(move);
  };

  return (
    <>
      <input
        className={`inline-input ${className}`}
        aria-label={label}
        autoFocus
        value={draft}
        list={listId}
        size={Math.max(3, draft.length + 1)}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") finish(true);
          else if (e.key === "Escape") finish(false);
          else if (e.key === "Tab") {
            e.preventDefault();
            finish(true, e.shiftKey ? -1 : 1);
          }
        }}
      />
      {suggestions && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </>
  );
}

/** Tracks which of a row's fields is being edited, and moves between them with Tab. */
function useRowEditing(fieldCount: number) {
  const [editing, setEditing] = useState<number | null>(null);
  const end = (move?: 1 | -1) =>
    setEditing((current) => {
      if (current === null || !move) return null;
      const next = current + move;
      return next >= 0 && next < fieldCount ? next : null;
    });
  return { editing, setEditing, end };
}

function IconButton({
  label,
  className = "",
  onClick,
  children,
}: {
  label: string;
  className?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`row-btn ${className}`}
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {children}
    </button>
  );
}

/* ---------- shot row ---------- */

const STATUS_ICONS: Record<string, ReactNode> = {
  shot: <Check {...ICON} />,
  pickup: <RotateCcw {...ICON} />,
  cut: <Ban {...ICON} />,
};

const PRIORITY_ICONS: Record<string, ReactNode> = {
  must: <Star {...ICON} fill="currentColor" />,
  low: <ArrowDown {...ICON} />,
};

export type ShotRowProps = {
  item: ListedShot;
  sceneId: string;
  project: Project;
  selected: boolean;
  dragDisabled: boolean;
  onSelect: () => void;
  onPatch: (patch: Partial<Shot>) => void;
  onCycleStatus: () => void;
  onCyclePriority: () => void;
};

export function ShotRow({
  item,
  sceneId,
  project,
  selected,
  dragDisabled,
  onSelect,
  onPatch,
  onCycleStatus,
  onCyclePriority,
}: ShotRowProps) {
  const { shot, id } = item;
  const lists = project.settings.lists;
  const { editing, setEditing, end } = useRowEditing(3);
  const sortable = useSortable({
    id: shot.id,
    data: { type: "shot" as const, sceneId },
    disabled: dragDisabled,
  });
  const selectTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (selectTimer.current !== null) window.clearTimeout(selectTimer.current);
    },
    []
  );
  const onRowClick = (e: React.MouseEvent) => {
    const onField = (e.target as HTMLElement).closest(".inline-value");
    if (!onField) {
      onSelect();
      return;
    }
    if (e.detail > 1) {
      if (selectTimer.current !== null) window.clearTimeout(selectTimer.current);
      selectTimer.current = null;
      return;
    }
    if (selectTimer.current !== null) window.clearTimeout(selectTimer.current);
    selectTimer.current = window.setTimeout(() => {
      selectTimer.current = null;
      onSelect();
    }, 250);
  };
  const style = { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition };
  const parens = project.settings.general.additionalInfoStyle === "parens";
  const statusLabel = choiceLabel("status", shot.status, lists);
  const priorityLabel = choiceLabel("priority", shot.priority, lists);

  const field = (index: number, key: "type" | "subject" | "additionalInfo", label: string, placeholder: string) => (
    <InlineField
      value={shot[key] ?? ""}
      placeholder={placeholder}
      label={`${label} of shot ${id}`}
      editing={editing === index}
      startOn="doubleClick"
      className={`shot-${key}`}
      format={key === "additionalInfo" ? (v) => (parens ? `(${v})` : `- ${v}`) : undefined}
      onStart={() => setEditing(index)}
      onCommit={(value) => onPatch({ [key]: value || undefined })}
      onEnd={end}
    />
  );

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      role="row"
      tabIndex={0}
      aria-selected={selected}
      className={[
        "shot-row",
        selected ? "selected" : "",
        shot.status === "cut" ? "is-cut" : "",
        shot.visible ? "" : "is-hidden",
        sortable.isDragging ? "is-dragging" : "",
      ].join(" ")}
      onClick={onRowClick}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "F2") {
          e.preventDefault();
          setEditing(0);
        } else if (e.key === "Enter") onSelect();
      }}
    >
      <span className="drag-handle" title="Drag to reorder" {...sortable.attributes} {...sortable.listeners} tabIndex={-1}>
        <GripVertical size={13} strokeWidth={1.75} />
      </span>
      <span className="shot-dot" style={{ background: shot.color }} />
      <span className="shot-id">{id}</span>
      <span className="shot-fields">
        {field(0, "type", "Shot type", "Type")}
        {field(1, "subject", "Subject", "Subject")}
        {field(2, "additionalInfo", "Additional info", "Info")}
      </span>
      <IconButton
        label={`Status: ${statusLabel}. Click to change.`}
        className={`slot status-${shot.status} ${shot.status === "planned" ? "slot-empty" : ""}`}
        onClick={onCycleStatus}
      >
        {STATUS_ICONS[shot.status] ??
          (shot.status === "planned" ? <Circle {...ICON} /> : <span className="slot-text">{statusLabel.slice(0, 2)}</span>)}
      </IconButton>
      <IconButton
        label={`Priority: ${priorityLabel}. Click to change.`}
        className={`slot priority-${shot.priority} ${shot.priority === "nice" ? "slot-empty" : ""}`}
        onClick={onCyclePriority}
      >
        {PRIORITY_ICONS[shot.priority] ??
          (shot.priority === "nice" ? <Star {...ICON} /> : <span className="slot-text">{priorityLabel.slice(0, 2)}</span>)}
      </IconButton>
      <IconButton
        label={shot.visible ? `Hide shot ${id} on the script` : `Show shot ${id} on the script`}
        className={shot.visible ? "eye" : "eye eye-off"}
        onClick={() => onPatch({ visible: !shot.visible })}
      >
        {shot.visible ? <Eye {...ICON} /> : <EyeOff {...ICON} />}
      </IconButton>
    </div>
  );
}

/* ---------- scene row with its shots ---------- */

const INDICATORS = ["INT.", "EXT.", "INT./EXT."];
const TIMES = ["DAY", "NIGHT", "DAWN", "DUSK", "MORNING", "EVENING", "LATER", "CONTINUOUS"];

export type SceneBlockProps = {
  listed: ListedScene;
  collapsed: boolean;
  selected: boolean;
  dragDisabled: boolean;
  onSelect: () => void;
  onToggleCollapsed: () => void;
  onHeading: (patch: Partial<Scene["heading"]>) => void;
  onToggleVisible: () => void;
  onDelete: () => void;
  children: ReactNode;
};

export function SceneBlock({
  listed,
  collapsed,
  selected,
  dragDisabled,
  onSelect,
  onToggleCollapsed,
  onHeading,
  onToggleVisible,
  onDelete,
  children,
}: SceneBlockProps) {
  const { scene, sceneIndex, shots } = listed;
  const number = sceneIndex + 1;
  const { editing, setEditing, end } = useRowEditing(3);
  const sortable = useSortable({ id: scene.id, data: { type: "scene" as const }, disabled: dragDisabled });
  const drop = useDroppable({ id: `scene-drop-${scene.id}`, data: { type: "scene-drop" as const, sceneId: scene.id } });
  const style = { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition };

  const field = (index: number, key: keyof Scene["heading"], label: string, placeholder: string, suggestions?: string[]) => (
    <InlineField
      value={scene.heading[key]}
      placeholder={placeholder}
      label={`${label} of scene ${number}`}
      editing={editing === index}
      startOn="click"
      className={`scene-${key}`}
      suggestions={suggestions}
      onStart={() => setEditing(index)}
      onCommit={(value) => onHeading({ [key]: value.trim() })}
      onEnd={end}
    />
  );

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      className={`scene-block ${sortable.isDragging ? "is-dragging" : ""} ${scene.visible ? "" : "is-hidden"}`}
    >
      <div
        role="row"
        tabIndex={0}
        aria-selected={selected}
        className={`scene-row ${selected ? "selected" : ""}`}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "F2") {
            e.preventDefault();
            setEditing(1);
          } else if (e.key === "Enter") onSelect();
        }}
      >
        <IconButton label={collapsed ? `Expand scene ${number}` : `Collapse scene ${number}`} onClick={onToggleCollapsed}>
          {collapsed ? <ChevronRight {...ICON} /> : <ChevronDown {...ICON} />}
        </IconButton>
        <span className="drag-handle" title="Drag to reorder" {...sortable.attributes} {...sortable.listeners} tabIndex={-1}>
          <GripVertical size={13} strokeWidth={1.75} />
        </span>
        <span className="scene-number">{number}</span>
        <span className="scene-heading">
          {field(0, "indicator", "Indicator", "INT.", INDICATORS)}
          {field(1, "location", "Location", "LOCATION")}
          <span className="scene-dash">-</span>
          {field(2, "time", "Time", "TIME", TIMES)}
        </span>
        {collapsed && shots.length > 0 && <span className="scene-count">{shots.length}</span>}
        <IconButton label={`Delete scene ${number}`} className="on-hover danger" onClick={onDelete}>
          <Trash2 {...ICON} />
        </IconButton>
        <IconButton
          label={scene.visible ? `Hide scene ${number} on the script` : `Show scene ${number} on the script`}
          className={scene.visible ? "eye" : "eye eye-off"}
          onClick={onToggleVisible}
        >
          {scene.visible ? <Eye {...ICON} /> : <EyeOff {...ICON} />}
        </IconButton>
      </div>
      {!collapsed && (
        <div ref={drop.setNodeRef} className={`scene-shots ${drop.isOver ? "is-over" : ""}`}>
          <SortableContext items={shots.map((item) => item.shot.id)} strategy={verticalListSortingStrategy}>
            {children}
          </SortableContext>
          {shots.length === 0 && <p className="scene-empty">No shots yet</p>}
        </div>
      )}
    </div>
  );
}
