import { formatToolKeyDisplay } from "../../lib/toolKeybinds";
import { useProjectStore } from "../../stores/projectStore";
import type { ScriptTool } from "../../types/annotations";
import { TOOL_KEYBIND_LABELS } from "../../types/toolKeybinds";

const TOOL_ORDER: ScriptTool[] = ["select", "line", "text"];

export function ScriptToolbar() {
  const activeTool = useProjectStore((s) => s.activeTool);
  const toolKeybinds = useProjectStore((s) => s.toolKeybinds);
  const setActiveTool = useProjectStore((s) => s.setActiveTool);

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
