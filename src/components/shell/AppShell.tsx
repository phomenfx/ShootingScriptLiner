import type { ReactNode } from "react";
import { COLLAPSED_PANEL_WIDTH_PX, panelSides, type SidePanel } from "../../lib/panelLayout";
import { usePrefsStore } from "../../stores/prefsStore";
import { useSessionStore } from "../../stores/sessionStore";
import { Panel } from "./Panel";
import { PanelResizer } from "./PanelResizer";

type AppShellProps = {
  topBar: ReactNode;
  notices: ReactNode;
  properties: ReactNode;
  script: ReactNode;
  scenes: ReactNode;
  /** Header controls for the Scenes panel (the List / Table switch). */
  scenesActions?: ReactNode;
};

const TITLES: Record<SidePanel, string> = { properties: "Properties", scenes: "Scenes" };

/**
 * The window: a top bar, then three columns. Side panels resize, collapse and
 * can swap sides; the script takes whatever is left. The window never scrolls
 * as a whole; each region scrolls by itself.
 */
export function AppShell({ topBar, notices, properties, script, scenes, scenesActions }: AppShellProps) {
  const panels = usePrefsStore((s) => s.panels);
  // In table mode the Scenes panel widens over the script, which stays mounted underneath.
  const table = useSessionStore((s) => s.scenesView === "table");
  const setPanelWidth = usePrefsStore((s) => s.setPanelWidth);
  const resetPanelWidth = usePrefsStore((s) => s.resetPanelWidth);
  const setPanelCollapsed = usePrefsStore((s) => s.setPanelCollapsed);

  const content: Record<SidePanel, ReactNode> = { properties, scenes };
  const sides = panelSides(panels.swapSides);
  const columnWidth = (panel: SidePanel) =>
    panels.collapsed[panel] ? COLLAPSED_PANEL_WIDTH_PX : panels.widthPx[panel];

  const sidePanel = (side: "left" | "right") => {
    const panel = sides[side];
    const collapsed = panels.collapsed[panel];
    return (
      <div
        className={`shell-side shell-side-${side}${table && panel === "scenes" ? " shell-side-wide" : ""}`}
        data-panel={panel}
        data-placement={panels.placement[panel]}
      >
        <Panel
          title={table && panel === "scenes" ? "Shot list" : TITLES[panel]}
          side={side}
          actions={panel === "scenes" ? scenesActions : undefined}
          collapsed={collapsed}
          onToggleCollapsed={() => setPanelCollapsed(panel, !collapsed)}
        >
          {content[panel]}
        </Panel>
        {!collapsed && !(table && panel === "scenes") && (
          <PanelResizer
            label={TITLES[panel]}
            side={side}
            widthPx={panels.widthPx[panel]}
            onResize={(px) => setPanelWidth(panel, px)}
            onReset={() => resetPanelWidth(panel)}
          />
        )}
      </div>
    );
  };

  return (
    <div className="app-shell">
      <div className="shell-top">
        {topBar}
        {notices}
      </div>
      <main
        className="shell-main"
        style={{
          gridTemplateColumns: `${columnWidth(sides.left)}px minmax(0, 1fr) ${columnWidth(sides.right)}px`,
        }}
      >
        {sidePanel("left")}
        <section className={`panel shell-script${table ? " is-under-table" : ""}`} aria-label="Script" aria-hidden={table || undefined}>
          {script}
        </section>
        {sidePanel("right")}
      </main>
    </div>
  );
}
