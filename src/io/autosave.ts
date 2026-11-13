/*
 * Autosave: the open project is kept in this browser a few seconds after each
 * change, until it is saved as a ZIP. On the next start the app offers to
 * bring it back. The script PDF comes from the browser's PDF cache, where it
 * already sits once imported or opened.
 *
 * This is a safety net, not a save: clearing the browser's site data removes it.
 */
import { usePrefsStore } from "../stores/prefsStore";
import { useProjectStore } from "../stores/projectStore";
import { serializeProject } from "./writeProject";

export const AUTOSAVE_KEY = "shooting-script-liner-autosave";
const DELAY_MS = 3000;

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
    const entry: Autosave = { savedAt: new Date().toISOString(), name: project.name, json: serializeProject(project) };
    try {
      storage()?.setItem(AUTOSAVE_KEY, JSON.stringify(entry));
    } catch {
      // Storage full or blocked: the project still works, there is just no safety copy.
    }
  };
  const unsubscribe = useProjectStore.subscribe((state, previous) => {
    if (state.project === previous.project && state.savedProject === previous.savedProject) return;
    if (timer) clearTimeout(timer);
    // Saved: clear at once. Changed: write once things go quiet.
    if (state.project === state.savedProject) {
      clearAutosave();
      return;
    }
    timer = setTimeout(write, DELAY_MS);
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
