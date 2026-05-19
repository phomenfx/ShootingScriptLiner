import { useEffect } from "react";
import { toolForKey } from "../lib/toolKeybinds";
import { useProjectStore } from "../stores/projectStore";

export function useAnnotationKeyboard(pageNum: number) {
  const selection = useProjectStore((s) => s.selection);
  const toolKeybinds = useProjectStore((s) => s.toolKeybinds);
  const deleteAnnotation = useProjectStore((s) => s.deleteAnnotation);
  const copySelectedLines = useProjectStore((s) => s.copySelectedLines);
  const pasteLines = useProjectStore((s) => s.pasteLines);
  const setActiveTool = useProjectStore((s) => s.setActiveTool);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      const tool = toolForKey(e.key, toolKeybinds);
      if (tool) {
        setActiveTool(tool);
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selection?.kind === "annotation") {
          e.preventDefault();
          deleteAnnotation(selection.annotationId);
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        if (selection?.kind === "annotation") {
          e.preventDefault();
          copySelectedLines();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        e.preventDefault();
        pasteLines(pageNum);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    selection,
    pageNum,
    deleteAnnotation,
    copySelectedLines,
    pasteLines,
    toolKeybinds,
    setActiveTool,
  ]);
}
