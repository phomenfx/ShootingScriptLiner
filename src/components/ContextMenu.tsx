/*
 * One right-click menu for the whole app. A component calls openContextMenu
 * with the pointer event and its items; the host draws the menu at the pointer.
 */
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import type { MouseEvent as ReactMouseEvent } from "react";
import { create } from "zustand";

export type ContextMenuItem =
  | { label: string; shortcut?: string; disabled?: boolean; danger?: boolean; onSelect: () => void }
  | "separator";

type MenuState = { at: { x: number; y: number } | null; items: ContextMenuItem[] };

const useMenu = create<MenuState>(() => ({ at: null, items: [] }));

/** Opens the menu at the pointer instead of the browser's own. */
export function openContextMenu(e: ReactMouseEvent | MouseEvent, items: ContextMenuItem[]): void {
  e.preventDefault();
  e.stopPropagation();
  useMenu.setState({ at: { x: e.clientX, y: e.clientY }, items });
}

export function ContextMenuHost() {
  const at = useMenu((s) => s.at);
  const items = useMenu((s) => s.items);
  return (
    <Dropdown.Root open={!!at} onOpenChange={(open) => !open && useMenu.setState({ at: null })} modal={false}>
      {/* An empty anchor at the pointer; the menu opens from it. */}
      <Dropdown.Trigger asChild>
        <span aria-hidden="true" style={{ position: "fixed", left: at?.x ?? 0, top: at?.y ?? 0, width: 0, height: 0 }} />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content className="menu context-menu" align="start" side="bottom" sideOffset={2} collisionPadding={8}>
          {items.map((item, index) =>
            item === "separator" ? (
              <Dropdown.Separator key={index} className="menu-separator" />
            ) : (
              <Dropdown.Item
                key={index}
                className={item.danger ? "menu-item menu-item-danger" : "menu-item"}
                disabled={item.disabled}
                onSelect={item.onSelect}
              >
                <span className="menu-text">{item.label}</span>
                {item.shortcut && <span className="menu-shortcut">{item.shortcut}</span>}
              </Dropdown.Item>
            )
          )}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
