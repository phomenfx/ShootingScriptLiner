import type { ScriptTool } from "../types/annotations";
import {
  DEFAULT_TOOL_KEYBINDS,
  TOOL_KEYBIND_LABELS,
  TOOL_KEYBIND_ORDER,
  type ToolKeybinds,
} from "../types/toolKeybinds";

const STORAGE_KEY = "shooting-script-liner-tool-keybinds";

/** Normalize a captured key to a single lowercase letter (a–z). */
export function normalizeToolKey(key: string): string | null {
  if (key.length !== 1) return null;
  const lower = key.toLowerCase();
  if (lower >= "a" && lower <= "z") return lower;
  return null;
}

export function formatToolKeyDisplay(key: string): string {
  return key.length === 1 ? key.toUpperCase() : key;
}

export function loadToolKeybinds(): ToolKeybinds {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_TOOL_KEYBINDS };
    const parsed = JSON.parse(raw) as Partial<ToolKeybinds>;
    const merged = { ...DEFAULT_TOOL_KEYBINDS, ...parsed };
    return sanitizeToolKeybinds(merged);
  } catch {
    return { ...DEFAULT_TOOL_KEYBINDS };
  }
}

export function saveToolKeybinds(binds: ToolKeybinds): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(binds));
}

/** Ensure single letters; fall back to defaults on invalid or duplicate keys. */
export function sanitizeToolKeybinds(binds: ToolKeybinds): ToolKeybinds {
  const out: ToolKeybinds = { ...DEFAULT_TOOL_KEYBINDS };
  const used = new Set<string>();

  for (const tool of TOOL_KEYBIND_ORDER) {
    const norm = normalizeToolKey(binds[tool] ?? "");
    const key = norm && !used.has(norm) ? norm : DEFAULT_TOOL_KEYBINDS[tool];
    out[tool] = key;
    used.add(key);
  }
  return out;
}

export function toolForKey(key: string, binds: ToolKeybinds): ScriptTool | null {
  const norm = normalizeToolKey(key);
  if (!norm) return null;
  for (const tool of TOOL_KEYBIND_ORDER) {
    if (binds[tool] === norm) return tool;
  }
  return null;
}

export function validateToolKeybindChange(
  binds: ToolKeybinds,
  tool: ScriptTool,
  newKey: string
): { ok: true; next: ToolKeybinds } | { ok: false; reason: string } {
  const norm = normalizeToolKey(newKey);
  if (!norm) {
    return { ok: false, reason: "Use a single letter key (A–Z)." };
  }
  for (const other of TOOL_KEYBIND_ORDER) {
    if (other !== tool && binds[other] === norm) {
      return { ok: false, reason: `That key is already used for ${TOOL_KEYBIND_LABELS[other]}.` };
    }
  }
  return { ok: true, next: { ...binds, [tool]: norm } };
}
