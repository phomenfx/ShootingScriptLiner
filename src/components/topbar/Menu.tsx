import * as Dropdown from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";

export type MenuEntry =
  | { kind: "separator" }
  | { kind: "label"; label: string }
  | {
      kind?: "item";
      label: string;
      shortcut?: string;
      disabled?: boolean;
      /** Shown as a tooltip; say why when the item is disabled. */
      hint?: string;
      onSelect: () => void;
    }
  | { kind: "check"; label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }
  | { kind: "radio"; label: string; checked: boolean; shortcut?: string; onSelect: () => void }
  /** A row that opens its own list to the side. */
  | { kind: "sub"; label: string; disabled?: boolean; entries: MenuEntry[] };

type MenuProps = {
  /** What the trigger button shows. */
  trigger: ReactNode;
  triggerClassName?: string;
  triggerLabel?: string;
  align?: "start" | "end";
  entries: MenuEntry[];
};

/** A dropdown menu. Keyboard, focus and dismissal come from the menu primitive. */
/** The rows of a menu or submenu. */
function MenuEntries({ entries }: { entries: MenuEntry[] }) {
  // In a menu with ticks or dots, plain items are indented to line up with them.
  const hasMarks = entries.some((entry) => entry.kind === "check" || entry.kind === "radio");
  return (
    <>
      {entries.map((entry, index) => {
        if (entry.kind === "separator") {
          return <Dropdown.Separator className="menu-separator" key={index} />;
        }
        if (entry.kind === "label") {
          return (
            <Dropdown.Label className="menu-label" key={index}>
              {entry.label}
            </Dropdown.Label>
          );
        }
        if (entry.kind === "sub") {
          return (
            <Dropdown.Sub key={index}>
              <Dropdown.SubTrigger className="menu-item" disabled={entry.disabled}>
                {hasMarks && <span className="menu-mark" />}
                <span className="menu-text">{entry.label}</span>
                <span className="menu-shortcut" aria-hidden="true">›</span>
              </Dropdown.SubTrigger>
              <Dropdown.Portal>
                <Dropdown.SubContent className="menu menu-sub" sideOffset={2} alignOffset={-4}>
                  <MenuEntries entries={entry.entries} />
                </Dropdown.SubContent>
              </Dropdown.Portal>
            </Dropdown.Sub>
          );
        }
        if (entry.kind === "check") {
          return (
            <Dropdown.CheckboxItem
              className="menu-item"
              key={index}
              checked={entry.checked}
              disabled={entry.disabled}
              onCheckedChange={(checked) => entry.onChange(checked === true)}
            >
              <span className="menu-mark">{entry.checked ? "✓" : ""}</span>
              <span className="menu-text">{entry.label}</span>
            </Dropdown.CheckboxItem>
          );
        }
        if (entry.kind === "radio") {
          return (
            <Dropdown.Item className="menu-item" key={index} role="menuitemradio" aria-checked={entry.checked} onSelect={entry.onSelect}>
              <span className="menu-mark menu-mark-radio">{entry.checked ? "●" : ""}</span>
              <span className="menu-text">{entry.label}</span>
              {entry.shortcut && <span className="menu-shortcut">{entry.shortcut}</span>}
            </Dropdown.Item>
          );
        }
        return (
          <Dropdown.Item className="menu-item" key={index} disabled={entry.disabled} title={entry.hint} onSelect={entry.onSelect}>
            {hasMarks && <span className="menu-mark" />}
            <span className="menu-text">{entry.label}</span>
            {entry.shortcut && <span className="menu-shortcut">{entry.shortcut}</span>}
          </Dropdown.Item>
        );
      })}
    </>
  );
}

export function Menu({ trigger, triggerClassName = "topbar-menu", triggerLabel, align = "start", entries }: MenuProps) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger className={triggerClassName} aria-label={triggerLabel}>
        {trigger}
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content className="menu" align={align} sideOffset={4}>
          <MenuEntries entries={entries} />
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
