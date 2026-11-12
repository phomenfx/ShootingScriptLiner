import { Copy, Magnet, MousePointer2, Slash, Type } from "lucide-react";
import * as commands from "../../commands";
import { formatToolKeyDisplay } from "../../lib/toolKeybinds";
import { usePrefsStore } from "../../stores/prefsStore";
import { useSessionStore } from "../../stores/sessionStore";
import type { ScriptTool } from "../../types/annotations";
import { TOOL_KEYBIND_LABELS } from "../../types/toolKeybinds";

const TOOLS: { id: ScriptTool; Icon: typeof MousePointer2 }[] = [
  { id: "select", Icon: MousePointer2 },
  { id: "line", Icon: Slash },
  { id: "text", Icon: Type },
];

const ICON = { size: 17, strokeWidth: 1.75 } as const;

/** Icon tools, matching the script card in the mockup. Shape and Image come later. */
export function ScriptToolbar() {
  const activeTool = useSessionStore((s) => s.activeTool);
  const setActiveTool = useSessionStore((s) => s.setActiveTool);
  const snapOn = useSessionStore((s) => s.snapEnabled);
  const toolKeybinds = usePrefsStore((s) => s.toolKeybinds);
  const canDuplicate = useSessionStore((s) => s.selection?.kind === "mark");

  return (
    <div className="script-toolbar" role="toolbar" aria-label="Script tools">
      {TOOLS.map(({ id, Icon }) => {
        const key = formatToolKeyDisplay(toolKeybinds[id]);
        const label = TOOL_KEYBIND_LABELS[id];
        const on = activeTool === id;
        return (
          <button
            key={id}
            type="button"
            className={on ? "script-tool on" : "script-tool"}
            aria-pressed={on}
            title={`${label} (${key})`}
            onClick={() => setActiveTool(id)}
          >
            <Icon {...ICON} />
          </button>
        );
      })}
      <span className="script-spacer" />
      <button
        type="button"
        className={snapOn ? "script-tool on" : "script-tool"}
        aria-pressed={snapOn}
        title="Snap (S)"
        onClick={() => commands.toggleSnap()}
      >
        <Magnet {...ICON} />
      </button>
      <button
        type="button"
        className="script-tool"
        title="Duplicate (Ctrl+D)"
        disabled={!canDuplicate}
        onClick={() => commands.duplicateSelection()}
      >
        <Copy size={16} strokeWidth={1.75} />
      </button>
    </div>
  );
}
