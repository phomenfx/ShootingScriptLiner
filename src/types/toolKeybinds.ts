import type { ScriptTool } from "./annotations";

export type ToolKeybinds = {
  select: string;
  line: string;
  text: string;
  shape: string;
  pen: string;
  polygon: string;
};

export const DEFAULT_TOOL_KEYBINDS: ToolKeybinds = {
  select: "v",
  line: "l",
  text: "t",
  shape: "r",
  pen: "p",
  polygon: "g",
};

export const TOOL_KEYBIND_ORDER: ScriptTool[] = ["select", "line", "text", "shape", "pen", "polygon"];

export const TOOL_KEYBIND_LABELS: Record<ScriptTool, string> = {
  select: "Select",
  line: "Line",
  text: "Text",
  shape: "Shape",
  pen: "Pen",
  polygon: "Polygon",
};
