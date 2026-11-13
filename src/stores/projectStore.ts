/**
 * The project being edited, with undo and redo.
 *
 * Every change goes through `apply` with a pure edit from `model/edits`.
 * Undo steps are grouped: changes that follow each other quickly (a drag,
 * typing in a field) make one step. `breakUndoGroup` ends a group early.
 */
import { create } from "zustand";
import { temporal } from "zundo";
import { createProject } from "../model/defaults";
import type { Edit } from "../model/edits";
import type { Project } from "../model/types";

/** A pause this long between changes starts a new undo step. */
const UNDO_GROUP_MS = 400;
const UNDO_LIMIT = 200;

type ProjectState = {
  project: Project;
  /** The project as last saved or opened. The project is unsaved when it differs. */
  savedProject: Project;
  apply: (edit: Edit) => void;
};

let groupTimer: ReturnType<typeof setTimeout> | undefined;

/** Makes the next change its own undo step, however soon it comes. */
export function breakUndoGroup(): void {
  clearTimeout(groupTimer);
  groupTimer = undefined;
}

export const useProjectStore = create<ProjectState>()(
  temporal(
    (set) => {
      const project = createProject();
      return {
        project,
        savedProject: project,
        apply: (edit) =>
          set((state) => {
            const next = edit(state.project);
            return next === state.project ? state : { project: next };
          }),
      };
    },
    {
      limit: UNDO_LIMIT,
      partialize: (state) => ({ project: state.project }),
      equality: (past, current) => past.project === current.project,
      // Record the state before the first change of a burst and skip the rest.
      handleSet: (record) => (pastState, replace, currentState, deltaState) => {
        const inGroup = groupTimer !== undefined;
        clearTimeout(groupTimer);
        groupTimer = setTimeout(() => (groupTimer = undefined), UNDO_GROUP_MS);
        if (!inGroup) {
          (record as (...args: unknown[]) => void)(pastState, replace, currentState, deltaState);
        }
      },
    }
  )
);

const history = () => useProjectStore.temporal.getState();

/** Replaces the whole project (New, Open). Clears undo history; the result counts as saved. */
export function replaceProject(project: Project): void {
  history().pause();
  useProjectStore.setState({ project, savedProject: project });
  history().resume();
  history().clear();
  breakUndoGroup();
}

/**
 * Applies an edit that is not something to undo, such as recording which
 * script PDF was imported. Clears undo history, since older steps would
 * bring back the state before it.
 */
export function applyWithoutUndo(edit: Edit): void {
  history().pause();
  useProjectStore.getState().apply(edit);
  history().resume();
  history().clear();
  breakUndoGroup();
}

/**
 * Applies an edit as part of the last undo step: undoing that step also undoes
 * this. For follow-ups that finish a gesture, like trimming a drawn line.
 */
export function applyIntoLastStep(edit: Edit): void {
  history().pause();
  useProjectStore.getState().apply(edit);
  history().resume();
}

/** Marks the open project as not saved to a file (restored autosave). */
export function markProjectUnsaved(): void {
  history().pause();
  useProjectStore.setState((state) => ({ savedProject: { ...state.savedProject } }));
  history().resume();
}

export function markProjectSaved(): void {
  history().pause();
  useProjectStore.setState((state) => ({ savedProject: state.project }));
  history().resume();
}

export function undoProject(): void {
  breakUndoGroup();
  history().undo();
}

export function redoProject(): void {
  breakUndoGroup();
  history().redo();
}

export function canUndo(): boolean {
  return history().pastStates.length > 0;
}

export function canRedo(): boolean {
  return history().futureStates.length > 0;
}

export function isProjectUnsaved(state: Pick<ProjectState, "project" | "savedProject">): boolean {
  return state.project !== state.savedProject;
}
