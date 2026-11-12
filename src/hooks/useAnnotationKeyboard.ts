import { useEffect } from "react";
import { toolForKey, normalizeToolKey } from "../lib/toolKeybinds";
import { toggleSnap } from "../commands";
import { usePrefsStore } from "../stores/prefsStore";
import { useSessionStore } from "../stores/sessionStore";

export function useAnnotationKeyboard(_pageNum: number) {
  const toolKeybinds = usePrefsStore((s) => s.toolKeybinds);
  const setActiveTool = useSessionStore((s) => s.setActiveTool);

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
      else if (!e.ctrlKey && !e.metaKey && !e.altKey && normalizeToolKey(e.key) === "s") {
        e.preventDefault();
        toggleSnap();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    toolKeybinds,
    setActiveTool,
  ]);
}
