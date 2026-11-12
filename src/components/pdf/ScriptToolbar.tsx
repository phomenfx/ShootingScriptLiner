import { formatToolKeyDisplay } from "../../lib/toolKeybinds";
import { useLegacyStore } from "../../legacy/legacyStore";
import type { ScriptTool } from "../../types/annotations";
import { TOOL_KEYBIND_LABELS } from "../../types/toolKeybinds";

const TOOL_ORDER: ScriptTool[] = ["select", "line", "text"];

export function ScriptToolbar() {
  const activeTool = useLegacyStore((s) => s.activeTool);
  const toolKeybinds = useLegacyStore((s) => s.toolKeybinds);
  const setActiveTool = useLegacyStore((s) => s.setActiveTool);

  return (
    <div className="script-toolbar" role="toolbar" aria-label="Script tools">
      {TOOL_ORDER.map((id) => {
        const key = formatToolKeyDisplay(toolKeybinds[id]);
        const label = TOOL_KEYBIND_LABELS[id];
        return (
          <button
            key={id}
            type="button"
            className={activeTool === id ? "active" : ""}
            title={`${label} (${key})`}
            onClick={() => setActiveTool(id)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
