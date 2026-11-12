import { useEffect } from "react";
import { toolForKey } from "../lib/toolKeybinds";
import { useLegacyStore } from "../legacy/legacyStore";

export function useAnnotationKeyboard(_pageNum: number) {
  const toolKeybinds = useLegacyStore((s) => s.toolKeybinds);
  const setActiveTool = useLegacyStore((s) => s.setActiveTool);

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
      if (tool && !e.ctrlKey && !e.metaKey && !e.altKey) setActiveTool(tool);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    toolKeybinds,
    setActiveTool,
  ]);
}
