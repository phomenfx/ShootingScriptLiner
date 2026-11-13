/*
 * The color bar above Properties. Clicking a swatch sets the default color for
 * new shots and marks, and recolors whatever is selected, as one undo step.
 * A mark locked to its shot's color recolors the shot.
 */
import { Lock, LockOpen, Pipette } from "lucide-react";
import * as edits from "../../model/edits";
import { recolor } from "../../model/recolor";
import type { ImageMark, Mark, Project } from "../../model/types";
import { breakUndoGroup, useProjectStore } from "../../stores/projectStore";
import { useSessionStore } from "../../stores/sessionStore";

export const SWATCHES = [
  "#E53935",
  "#FB8C00",
  "#FDD835",
  "#43A047",
  "#00897B",
  "#1E88E5",
  "#3949AB",
  "#8E24AA",
  "#D81B60",
  "#6D4C41",
  "#757575",
  "#212121",
];

/** The default color, and the selection recolored to match. */
export function applyColor(color: string, dragging = false): void {
  const selection = useSessionStore.getState().selection;
  const edit: edits.Edit = (project: Project) => {
    const next = edits.updateSettings((s) => ({ ...s, general: { ...s.general, newShotColor: color } }))(project);
    // Marks locked to their shot recolor the shot, like any other locked field.
    return selection ? recolor(next, selection, color) : next;
  };
  // While dragging in the picker, the changes merge into one undo step.
  if (!dragging) breakUndoGroup();
  useProjectStore.getState().apply(edit);
  if (!dragging) breakUndoGroup();
}

/** Selected lines, notes and shapes that have a shot whose color they could follow. */
function linkedMarks(project: Project, selection: ReturnType<typeof useSessionStore.getState>["selection"]) {
  if (selection?.kind !== "mark") return [];
  const ids = new Set(selection.ids);
  return project.marks.filter((m): m is Exclude<Mark, ImageMark> => ids.has(m.id) && m.kind !== "image" && !!edits.findShot(project, m.shotId));
}

/** Locks the selected marks to their shot's color, or gives each its own (starting from the shot's). */
function setFollowsShot(follow: boolean): void {
  breakUndoGroup();
  useProjectStore.getState().apply((project) => {
    let next = project;
    for (const mark of linkedMarks(project, useSessionStore.getState().selection)) {
      const shotColor = edits.findShot(project, mark.shotId)!.shot.color;
      next = edits.updateMark(mark.id, (m) => {
        if (m.kind === "image") return m;
        if (!follow) return m.color === undefined ? { ...m, color: shotColor } : m;
        const { color: _gone, ...rest } = m;
        return rest as typeof m;
      })(next);
    }
    return next;
  });
  breakUndoGroup();
}

export function ColorBar() {
  const current = useProjectStore((s) => s.project.settings.general.newShotColor);
  const project = useProjectStore((s) => s.project);
  const selection = useSessionStore((s) => s.selection);
  const linked = linkedMarks(project, selection);
  const follows = linked.length > 0 && linked.every((m) => m.color === undefined);
  const lockTitle =
    linked.length === 0
      ? "Select a line, note or shape linked to a shot to lock its color to the shot"
      : follows
        ? "Follows the shot's color (swatches recolor the shot). Click to give it its own color."
        : "Has its own color. Click to follow the shot's color again.";
  const target = selection?.kind === "shot" ? "the selected shot" : selection?.kind === "scene" ? "the scene's shots" : selection?.kind === "mark" ? "the selection" : null;
  const hint = (color: string) => `${color}: default for new shots and marks${target ? `, and recolors ${target}` : ""}`;
  return (
    <div className="color-bar" role="toolbar" aria-label="Color">
      <button
        type="button"
        className={`color-bar-lock${follows ? " is-locked" : ""}`}
        disabled={linked.length === 0}
        aria-pressed={follows}
        title={lockTitle}
        aria-label={lockTitle}
        onClick={() => setFollowsShot(!follows)}
      >
        {follows ? <Lock size={13} strokeWidth={1.75} /> : <LockOpen size={13} strokeWidth={1.75} />}
      </button>
      <label className="color-bar-current" title={hint(current)}>
        <span className="color-bar-chip" style={{ background: current }} />
        <Pipette size={13} strokeWidth={1.75} aria-hidden="true" />
        <input type="color" aria-label="Pick any color" value={current} onChange={(e) => applyColor(e.target.value.toUpperCase(), true)} />
      </label>
      {/* 12 swatches: one row, or two rows of 6, or three of 4, so wrapped rows stay even. */}
      <div className="color-bar-swatches">
      {SWATCHES.map((color) => (
        <button
          key={color}
          type="button"
          className={color.toLowerCase() === current.toLowerCase() ? "color-bar-swatch on" : "color-bar-swatch"}
          style={{ background: color }}
          title={hint(color)}
          aria-label={hint(color)}
          onClick={() => applyColor(color)}
        />
      ))}
      </div>
    </div>
  );
}
