/*
 * Autosave: the open project is kept in this browser a few seconds after each
 * change, until it is saved as a ZIP. On the next start the app offers to
 * bring it back. The script PDF comes from the browser's PDF cache, where it
 * already sits once imported or opened.
 *
 * This is a safety net, not a save: clearing the browser's site data removes it.
 */
import { withCurrentView } from "../lib/projectView";
import { usePrefsStore } from "../stores/prefsStore";
import { useProjectStore } from "../stores/projectStore";
import { serializeProject } from "./writeProject";

export const AUTOSAVE_KEY = "shooting-script-liner-autosave";
/** Earlier copies to go back to, newest first. Kept after saving; cleared from Settings. */
export const RESTORE_POINTS_KEY = "shooting-script-liner-restore-points";
/** A new restore point at most this often while working. */
const RESTORE_POINT_EVERY_MS = 5 * 60 * 1000;

export type Autosave = { savedAt: string; name: string; json: string };

function storage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function readAutosave(): Autosave | null {
  try {
    const raw = storage()?.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Autosave>;
    return typeof parsed.json === "string" && typeof parsed.savedAt === "string"
      ? { savedAt: parsed.savedAt, name: parsed.name ?? "", json: parsed.json }
      : null;
  } catch {
    return null;
  }
}

export function readRestorePoints(): Autosave[] {
  try {
    const raw = storage()?.getItem(RESTORE_POINTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? parsed.filter((p): p is Autosave => !!p && typeof p.json === "string" && typeof p.savedAt === "string")
      : [];
  } catch {
    return [];
  }
}

export function clearRestorePoints(): void {
  newestKnown = null;
  try {
    storage()?.removeItem(RESTORE_POINTS_KEY);
  } catch {
    /* nothing to clear */
  }
}

/**
 * Adds a copy to the restore points when the newest is old enough (or is
 * another project), keeping at most `keep`. Drops the oldest when the
 * browser's storage is full.
 */
/** The newest restore point's name and time, so most autosaves needn't read them all back. */
let newestKnown: { name: string; at: number } | null = null;

export function addRestorePoint(entry: Autosave, keep: number, force = false): void {
  if (keep <= 0) return;
  const at = Date.parse(entry.savedAt);
  const recent = (n: { name: string; at: number } | null) => !!n && n.name === entry.name && at - n.at >= 0 && at - n.at < RESTORE_POINT_EVERY_MS;
  if (!force && recent(newestKnown)) return;
  const points = readRestorePoints();
  const newest = points[0];
  newestKnown = newest ? { name: newest.name, at: Date.parse(newest.savedAt) } : null;
  if (!force && recent(newestKnown)) return;
  let next = [entry, ...points].slice(0, keep);
  while (next.length > 0) {
    try {
      storage()?.setItem(RESTORE_POINTS_KEY, JSON.stringify(next));
      newestKnown = { name: entry.name, at };
      return;
    } catch {
      next = next.slice(0, -1);
    }
  }
}

export function clearAutosave(): void {
  try {
    storage()?.removeItem(AUTOSAVE_KEY);
  } catch {
    /* nothing to clear */
  }
}

/**
 * Starts watching the project. Unsaved work is written a few seconds after the
 * last change; saving the project (or opening a saved one) clears the copy.
 * Returns a function that stops watching.
 */
export function startAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const write = () => {
    const { project, savedProject } = useProjectStore.getState();
    // Turned off in Settings, or nothing unsaved: keep no copy.
    if (project === savedProject || !usePrefsStore.getState().autosave) {
      clearAutosave();
      return;
    }
    const entry: Autosave = { savedAt: new Date().toISOString(), name: project.name, json: serializeProject(withCurrentView(project)) };
    try {
      storage()?.setItem(AUTOSAVE_KEY, JSON.stringify(entry));
    } catch {
      // Storage full or blocked: the project still works, there is just no safety copy.
    }
    addRestorePoint(entry, usePrefsStore.getState().restorePoints);
  };
  const unsubscribe = useProjectStore.subscribe((state, previous) => {
    if (state.project === previous.project && state.savedProject === previous.savedProject) return;
    // Saved: clear at once. Changed: write once things go quiet.
    if (state.project === state.savedProject) {
      if (timer) clearTimeout(timer);
      timer = undefined;
      clearAutosave();
      return;
    }
    // A few seconds: once things go quiet. Longer: at most that often, however busy.
    const seconds = usePrefsStore.getState().autosaveSeconds;
    if (seconds <= 5) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(write, Math.max(1, seconds) * 1000);
    } else if (!timer) {
      timer = setTimeout(() => {
        timer = undefined;
        write();
      }, seconds * 1000);
    }
  });
  // Last chance before the tab closes.
  const onHide = () => {
    if (timer) {
      clearTimeout(timer);
      write();
    }
  };
  const win = typeof window !== "undefined" ? window : null;
  win?.addEventListener("pagehide", onHide);
  return () => {
    unsubscribe();
    if (timer) clearTimeout(timer);
    win?.removeEventListener("pagehide", onHide);
  };
}
