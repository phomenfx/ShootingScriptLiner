/*
 * The color bar above Properties. Clicking a swatch sets the default color for
 * new shots and marks, and recolors whatever is selected, as one undo step.
 */
import { Pipette } from "lucide-react";
import * as edits from "../../model/edits";
import type { Project } from "../../model/types";
import { breakUndoGroup, useProjectStore } from "../../stores/projectStore";
import { useSessionStore } from "../../stores/sessionStore";

const SWATCHES = [
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
function applyColor(color: string, dragging = false): void {
  const selection = useSessionStore.getState().selection;
  const ids = new Set(selection?.ids ?? []);
  const edit: edits.Edit = (project: Project) => {
    let next = edits.updateSettings((s) => ({ ...s, general: { ...s.general, newShotColor: color } }))(project);
    if (selection?.kind === "shot") {
      for (const id of ids) next = edits.updateShot(id, (shot) => ({ ...shot, color }))(next);
    } else if (selection?.kind === "scene") {
      // A scene has no color of its own; its shots take it.
      next = { ...next, scenes: next.scenes.map((scene) => (ids.has(scene.id) ? { ...scene, shots: scene.shots.map((shot) => ({ ...shot, color })) } : scene)) };
    } else if (selection?.kind === "mark") {
      // A line, note or shape gets its own color, even when it follows a shot.
      for (const id of ids) next = edits.updateMark(id, (mark) => (mark.kind === "image" ? mark : { ...mark, color }))(next);
    }
    return next;
  };
  // While dragging in the picker, the changes merge into one undo step.
  if (!dragging) breakUndoGroup();
  useProjectStore.getState().apply(edit);
  if (!dragging) breakUndoGroup();
}

export function ColorBar() {
  const current = useProjectStore((s) => s.project.settings.general.newShotColor);
  const selection = useSessionStore((s) => s.selection);
  const target = selection?.kind === "shot" ? "the selected shot" : selection?.kind === "scene" ? "the scene's shots" : selection?.kind === "mark" ? "the selection" : null;
  const hint = (color: string) => `${color}: default for new shots and marks${target ? `, and recolors ${target}` : ""}`;
  return (
    <div className="color-bar" role="toolbar" aria-label="Color">
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
