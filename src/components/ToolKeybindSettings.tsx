import { useEffect, useState } from "react";
import { formatToolKeyDisplay } from "../lib/toolKeybinds";
import { useProjectStore } from "../stores/projectStore";
import type { ScriptTool } from "../types/annotations";
import { DEFAULT_TOOL_KEYBINDS, TOOL_KEYBIND_LABELS, TOOL_KEYBIND_ORDER } from "../types/toolKeybinds";

export function ToolKeybindSettings() {
  const toolKeybinds = useProjectStore((s) => s.toolKeybinds);
  const setToolKeybind = useProjectStore((s) => s.setToolKeybind);
  const resetToolKeybinds = useProjectStore((s) => s.resetToolKeybinds);
  const [listening, setListening] = useState<ScriptTool | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!listening) return;

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const err = setToolKeybind(listening, e.key);
      if (err) setError(err);
      else setError(null);
      setListening(null);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [listening, setToolKeybind]);

  return (
    <div className="tool-keybind-settings">
      <p className="settings-hint settings-hint-tight">
        Single letter keys (A–Z). Each tool needs a unique key.
      </p>
      {TOOL_KEYBIND_ORDER.map((tool) => (
        <div key={tool} className="keybind-row">
          <span className="keybind-label">{TOOL_KEYBIND_LABELS[tool]}</span>
          <kbd className="keybind-key">{formatToolKeyDisplay(toolKeybinds[tool])}</kbd>
          <button
            type="button"
            className={listening === tool ? "active" : ""}
            onClick={() => {
              setError(null);
              setListening(tool);
            }}
          >
            {listening === tool ? "Press a key…" : "Change"}
          </button>
        </div>
      ))}
      {error && <p className="keybind-error">{error}</p>}
      <button
        type="button"
        className="keybind-reset"
        onClick={() => {
          resetToolKeybinds();
          setError(null);
          setListening(null);
        }}
      >
        Reset to defaults (
        {TOOL_KEYBIND_ORDER.map((t) => formatToolKeyDisplay(DEFAULT_TOOL_KEYBINDS[t])).join(", ")}
        )
      </button>
    </div>
  );
}
