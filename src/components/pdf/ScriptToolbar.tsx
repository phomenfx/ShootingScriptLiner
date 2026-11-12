import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { Brackets, ChevronDown, Circle, Copy, Hexagon, Highlighter, Magnet, MousePointer2, Pencil, Pentagon, Slash, Square, Stamp, Star, Type } from "lucide-react";
import * as commands from "../../commands";
import { formatToolKeyDisplay } from "../../lib/toolKeybinds";
import { usePrefsStore } from "../../stores/prefsStore";
import { useSessionStore } from "../../stores/sessionStore";
import type { ScriptTool } from "../../types/annotations";
import { TOOL_KEYBIND_LABELS } from "../../types/toolKeybinds";
import { choiceLabel } from "../../model/registry";
import { SHAPE_KINDS } from "../../lib/shapeGeometry";

/** An icon for each shape the Shape tool can draw. */
export const SHAPE_ICONS: Record<string, typeof MousePointer2> = {
  rectangle: Square,
  ellipse: Circle,
  highlight: Highlighter,
  polygon: Hexagon,
  star: Star,
  bracket: Brackets,
  stamp: Stamp,
};

const TOOLS: { id: ScriptTool; Icon: typeof MousePointer2 }[] = [
  { id: "select", Icon: MousePointer2 },
  { id: "line", Icon: Slash },
  { id: "text", Icon: Type },
];

const ICON = { size: 17, strokeWidth: 1.75 } as const;

const PATH_TOOLS: { id: ScriptTool; Icon: typeof MousePointer2 }[] = [
  { id: "pen", Icon: Pencil },
  { id: "polygon", Icon: Pentagon },
];

/** Icon tools, matching the script card in the mockup. Image comes later. */
export function ScriptToolbar() {
  const activeTool = useSessionStore((s) => s.activeTool);
  const setActiveTool = useSessionStore((s) => s.setActiveTool);
  const snapOn = useSessionStore((s) => s.snapEnabled);
  const toolKeybinds = usePrefsStore((s) => s.toolKeybinds);
  const canDuplicate = useSessionStore((s) => s.selection?.kind === "mark");
  const shapeKind = useSessionStore((s) => s.shapeKind);
  const setShapeKind = useSessionStore((s) => s.setShapeKind);
  const ShapeIcon = SHAPE_ICONS[shapeKind] ?? Square;
  const shapeOn = activeTool === "shape";
  const shapeKey = formatToolKeyDisplay(toolKeybinds.shape);

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
      {/* The Shape tool draws the shape last picked from its menu. */}
      <span className="script-tool-group">
        <button
          type="button"
          className={shapeOn ? "script-tool on" : "script-tool"}
          aria-pressed={shapeOn}
          title={`${choiceLabel("shape", shapeKind)} (${shapeKey})`}
          onClick={() => setActiveTool("shape")}
        >
          <ShapeIcon {...ICON} />
        </button>
        <Dropdown.Root modal={false}>
          <Dropdown.Trigger className="script-tool script-tool-more" aria-label="Pick a shape">
            <ChevronDown size={12} strokeWidth={2} />
          </Dropdown.Trigger>
          <Dropdown.Portal>
            <Dropdown.Content className="menu" align="start" sideOffset={4}>
              {SHAPE_KINDS.map((kind) => {
                const Icon = SHAPE_ICONS[kind] ?? Square;
                return (
                  <Dropdown.Item key={kind} className="menu-item" role="menuitemradio" aria-checked={kind === shapeKind} onSelect={() => setShapeKind(kind)}>
                    <span className="menu-mark menu-mark-radio">{kind === shapeKind ? "●" : ""}</span>
                    <Icon size={15} strokeWidth={1.75} />
                    <span className="menu-text">{choiceLabel("shape", kind)}</span>
                  </Dropdown.Item>
                );
              })}
            </Dropdown.Content>
          </Dropdown.Portal>
        </Dropdown.Root>
      </span>
      {/* Pen draws freehand; Polygon drops a corner per click. Both make shapes. */}
      {PATH_TOOLS.map(({ id, Icon }) => {
        const on = activeTool === id;
        return (
          <button
            key={id}
            type="button"
            className={on ? "script-tool on" : "script-tool"}
            aria-pressed={on}
            title={`${TOOL_KEYBIND_LABELS[id]} (${formatToolKeyDisplay(toolKeybinds[id])})`}
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
