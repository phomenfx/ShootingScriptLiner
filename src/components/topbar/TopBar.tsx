import { ChevronDown, FolderOpen, Menu as MenuIcon, Monitor, Moon, Save, Settings, Sun, Upload } from "lucide-react";
import { useStore } from "zustand";
import * as commands from "../../commands";
import { useProjectStore } from "../../stores/projectStore";
import { usePrefsStore } from "../../stores/prefsStore";
import { useSessionStore } from "../../stores/sessionStore";
import { UI_SCALES, type ColorTheme } from "../../types/appPreferences";
import { Menu, type MenuEntry } from "./Menu";
import { ProjectName } from "./ProjectName";

const NOT_YET = "Not built yet";
const ICON = { size: 15, strokeWidth: 1.75 } as const;
const SEPARATOR: MenuEntry = { kind: "separator" };

const THEMES: { value: ColorTheme; label: string; Icon: typeof Moon }[] = [
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
];

export function TopBar() {
  const canUndo = useStore(useProjectStore.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(useProjectStore.temporal, (s) => s.futureStates.length > 0);
  const hasSelection = useSessionStore((s) => s.selection !== null);
  const scenesView = useSessionStore((s) => s.scenesView);
  const hasClipboard = useSessionStore((s) => !!s.clipboard?.length || !!s.outlineClipboard);
  const hasCopyable = useSessionStore((s) => !!s.selection?.ids.length);
  const openSettings = useSessionStore((s) => s.setSettingsOpen);
  const prefs = usePrefsStore();
  const firstPageAlone = useProjectStore((s) => s.project.settings.drawing.firstPageAlone);

  const exportEntries: MenuEntry[] = [
    { label: "Lined script PDF", shortcut: "Ctrl+E", onSelect: () => void commands.exportLinedPdf() },
    { label: "Shot list CSV", onSelect: () => void commands.exportShotListCsv() },
    { label: "Both", onSelect: () => void commands.exportBoth() },
  ];

  const fileEntries: MenuEntry[] = [
    { label: "New project", onSelect: () => void commands.requestNewProject() },
    { label: "Open…", shortcut: "Ctrl+O", onSelect: () => void commands.requestOpenProject() },
    { label: "Save", shortcut: "Ctrl+S", onSelect: () => void commands.saveZip() },
    SEPARATOR,
    { label: "Import script PDF…", onSelect: () => void commands.requestImportPdf() },
    { label: "Import shot list…", disabled: true, hint: NOT_YET, onSelect: () => {} },
    SEPARATOR,
    { label: "Export lined PDF…", shortcut: "Ctrl+E", onSelect: () => void commands.exportLinedPdf() },
    { label: "Export shot list CSV…", onSelect: () => void commands.exportShotListCsv() },
    SEPARATOR,
    { label: "Project settings…", onSelect: () => openSettings(true) },
  ];

  const editEntries: MenuEntry[] = [
    { label: "Undo", shortcut: "Ctrl+Z", disabled: !canUndo, onSelect: commands.undo },
    { label: "Redo", shortcut: "Ctrl+Shift+Z", disabled: !canRedo, onSelect: commands.redo },
    SEPARATOR,
    { label: "Cut", shortcut: "Ctrl+X", disabled: !hasCopyable, onSelect: commands.cut },
    { label: "Copy", shortcut: "Ctrl+C", disabled: !hasCopyable, onSelect: commands.copy },
    { label: "Paste", shortcut: "Ctrl+V", disabled: !hasClipboard, onSelect: () => commands.paste() },
    { label: "Paste in place", shortcut: "Ctrl+Shift+V", disabled: !hasClipboard, onSelect: commands.pasteInPlace },
    { label: "Duplicate", shortcut: "Ctrl+D", disabled: !hasCopyable, onSelect: commands.duplicateSelection },
    { label: "Delete", shortcut: "Del", disabled: !hasCopyable, onSelect: commands.deleteSelection },
    SEPARATOR,
    { label: "Select all on page", shortcut: "Ctrl+A", disabled: true, hint: NOT_YET, onSelect: () => {} },
    { label: "Deselect", shortcut: "Esc", disabled: !hasSelection, onSelect: commands.deselect },
  ];

  const viewEntries: MenuEntry[] = [
    { kind: "radio", label: "Single page", checked: prefs.viewerLayoutMode === "single", onSelect: () => commands.setViewMode("single") },
    { kind: "radio", label: "Continuous scroll", checked: prefs.viewerLayoutMode === "scroll", onSelect: () => commands.setViewMode("scroll") },
    { kind: "radio", label: "Book spread", checked: prefs.viewerLayoutMode === "spread", onSelect: () => commands.setViewMode("spread") },
    {
      kind: "check",
      label: "First page alone",
      checked: firstPageAlone,
      disabled: prefs.viewerLayoutMode !== "spread",
      onChange: commands.setFirstPageAlone,
    },
    SEPARATOR,
    { label: "Zoom in", shortcut: "Ctrl+=", onSelect: commands.zoomIn },
    { label: "Zoom out", shortcut: "Ctrl+-", onSelect: commands.zoomOut },
    { label: "Fit page", shortcut: "Ctrl+0", onSelect: commands.zoomToFit },
    SEPARATOR,
    {
      kind: "check",
      label: "Properties panel",
      checked: !prefs.panels.collapsed.properties,
      onChange: (shown) => prefs.setPanelCollapsed("properties", !shown),
    },
    {
      kind: "check",
      label: "Scenes panel",
      checked: !prefs.panels.collapsed.scenes,
      onChange: (shown) => prefs.setPanelCollapsed("scenes", !shown),
    },
    {
      kind: "check",
      label: "Action bar",
      checked: prefs.showActionBar,
      onChange: prefs.setShowActionBar,
    },
    {
      kind: "check",
      label: "Shot list table",
      checked: scenesView === "table",
      onChange: (on) => {
        // The table lives in the Scenes panel, so show the panel too.
        if (on) prefs.setPanelCollapsed("scenes", false);
        useSessionStore.getState().setScenesView(on ? "table" : "list");
      },
    },
    { kind: "check", label: "Swap side panels", checked: prefs.panels.swapSides, onChange: prefs.setSwapSides },
    SEPARATOR,
    { kind: "label", label: "Theme" },
    ...THEMES.map(
      ({ value, label }): MenuEntry => ({
        kind: "radio",
        label,
        checked: prefs.colorTheme === value,
        onSelect: () => prefs.setColorTheme(value),
      })
    ),
    SEPARATOR,
    { kind: "label", label: "UI scale" },
    ...UI_SCALES.map(
      (scale): MenuEntry => ({
        kind: "radio",
        label: `${scale}%`,
        checked: prefs.uiScale === scale,
        onSelect: () => prefs.setUiScale(scale),
      })
    ),
  ];

  // In a narrow window the buttons on the right fold into this one menu.
  const moreEntries: MenuEntry[] = [
    { label: "Open…", shortcut: "Ctrl+O", onSelect: () => void commands.requestOpenProject() },
    { label: "Save", shortcut: "Ctrl+S", onSelect: () => void commands.saveZip() },
    SEPARATOR,
    ...exportEntries.map((entry): MenuEntry => ("label" in entry ? { ...entry, label: `Export: ${entry.label}` } : entry)),
    SEPARATOR,
    { label: "Settings…", onSelect: () => openSettings(true) },
  ];

  return (
    <header className="topbar">
      <span className="topbar-brand">Shooting Script Liner</span>
      <nav className="topbar-menus" aria-label="Main menu">
        <Menu trigger="File" entries={fileEntries} />
        <Menu trigger="Edit" entries={editEntries} />
        <Menu trigger="View" entries={viewEntries} />
      </nav>

      <ProjectName />

      <div className="topbar-right">
        <div className="topbar-wide">
          <button type="button" className="topbar-btn" onClick={() => void commands.requestOpenProject()}>
            <FolderOpen {...ICON} />
            Open
          </button>
          <button type="button" className="topbar-btn" title="Save (Ctrl+S)" onClick={() => void commands.saveZip()}>
            <Save {...ICON} />
            Save
          </button>
          <Menu
            triggerClassName="topbar-btn"
            align="end"
            trigger={
              <>
                <Upload {...ICON} />
                Export
                <ChevronDown size={13} strokeWidth={1.75} />
              </>
            }
            entries={exportEntries}
          />
          <div className="topbar-theme" role="radiogroup" aria-label="Theme">
            {THEMES.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={prefs.colorTheme === value}
                aria-label={`${label} theme`}
                title={`${label} theme`}
                className={prefs.colorTheme === value ? "on" : undefined}
                onClick={() => prefs.setColorTheme(value)}
              >
                <Icon size={14} strokeWidth={1.75} />
              </button>
            ))}
          </div>
          <button type="button" className="topbar-btn" onClick={() => openSettings(true)}>
            <Settings {...ICON} />
            Settings
          </button>
        </div>
        <div className="topbar-narrow">
          <Menu
            triggerClassName="topbar-btn"
            triggerLabel="More"
            align="end"
            trigger={<MenuIcon {...ICON} />}
            entries={moreEntries}
          />
        </div>
      </div>
    </header>
  );
}
