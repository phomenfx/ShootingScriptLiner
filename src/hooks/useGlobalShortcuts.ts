import { useEffect } from "react";
import * as commands from "../commands";
import { isProjectUnsaved, useProjectStore } from "../stores/projectStore";

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.tagName) return false;
  return (
    el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable
  );
}

/** Ctrl (or Cmd) shortcuts that work everywhere, even while typing. */
const ALWAYS: Record<string, () => void> = {
  s: () => void commands.saveZip(),
  o: () => void commands.requestOpenProject(),
  e: () => commands.requestExportLinedPdf(),
  "=": commands.zoomIn,
  "+": commands.zoomIn,
  "-": commands.zoomOut,
  "0": commands.zoomToFit,
};

/** Ctrl (or Cmd) shortcuts that yield to a text field's own editing. */
const OUTSIDE_FIELDS: Record<string, (shift: boolean) => void> = {
  z: (shift) => (shift ? commands.redo() : commands.undo()),
  y: () => commands.redo(),
  x: () => commands.cut(),
  c: () => commands.copy(),
  v: (shift) => (shift ? commands.pasteInPlace() : commands.paste()),
  d: () => commands.duplicateSelection(),
  h: (shift) => (shift ? commands.hideSelectedScene() : commands.hideSelectedShot()),
};

/** App-wide shortcuts, and the warning when leaving with unsaved work. */
export function useGlobalShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const typing = isTyping(e.target);

      // Alt+H shows everything hidden: shots, scenes, and table rows and columns.
      if (e.altKey && !e.ctrlKey && !e.metaKey && key === "h" && !typing) {
        e.preventDefault();
        commands.showAllHidden();
        return;
      }

      if (!(e.ctrlKey || e.metaKey)) {
        if (typing || e.altKey) return;
        if (key === "delete" || key === "backspace") {
          if (commands.hasDeletableSelection()) {
            e.preventDefault();
            commands.deleteSelection();
          }
        } else if (key === "escape" && !document.querySelector('[role="dialog"], [role="menu"]')) {
          commands.deselect();
        }
        return;
      }
      if (e.altKey) return;

      const always = ALWAYS[key];
      if (always) {
        e.preventDefault();
        always();
        return;
      }
      const outside = OUTSIDE_FIELDS[key];
      if (outside && !typing) {
        e.preventDefault();
        outside(e.shiftKey);
      }
    };

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isProjectUnsaved(useProjectStore.getState())) e.preventDefault();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);
}
