import type { ScriptTool } from "./annotations";

export type ToolKeybinds = {
  select: string;
  line: string;
  text: string;
};

export const DEFAULT_TOOL_KEYBINDS: ToolKeybinds = {
  select: "v",
  line: "l",
  text: "t",
};

export const TOOL_KEYBIND_ORDER: ScriptTool[] = ["select", "line", "text"];

export const TOOL_KEYBIND_LABELS: Record<ScriptTool, string> = {
  select: "Select",
  line: "Line",
  text: "Text",
};
