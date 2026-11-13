import { useEffect, useState, type ReactNode } from "react";
import { COLLAPSED_PANEL_WIDTH_PX, panelSides, shellMode, type SidePanel } from "../../lib/panelLayout";
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

function useWindowWidth(): number {
  const [width, setWidth] = useState(() => (typeof window === "undefined" ? 1400 : window.innerWidth));
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

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
  const windowWidth = useWindowWidth();
  // Wide: each panel opens and folds by itself. Narrower: one at a time; narrowest: it slides over the script.
  const mode = shellMode(windowWidth);
  const compactPanel = useSessionStore((s) => s.compactPanel);
  const setCompactPanel = useSessionStore((s) => s.setCompactPanel);
  // The shot list table needs the Scenes panel, so it is the open one.
  const openOne = table ? "scenes" : compactPanel;
  const isCollapsed = (panel: SidePanel) => (mode === "wide" ? panels.collapsed[panel] : openOne !== panel);
  const toggle = (panel: SidePanel) => {
    if (mode === "wide") setPanelCollapsed(panel, !panels.collapsed[panel]);
    else setCompactPanel(openOne === panel ? null : panel);
  };
  const overlay = mode === "narrow";
  const openWidth = (panel: SidePanel) => Math.min(panels.widthPx[panel], Math.max(240, windowWidth * (overlay ? 0.85 : 0.45)));
  const columnWidth = (panel: SidePanel) =>
    isCollapsed(panel) || overlay ? COLLAPSED_PANEL_WIDTH_PX : openWidth(panel);

  const sidePanel = (side: "left" | "right") => {
    const panel = sides[side];
    const collapsed = isCollapsed(panel);
    // The shot list table keeps its full-width layout; other open panels slide over.
    const slides = overlay && !collapsed && !(table && panel === "scenes");
    return (
      <div
        className={`shell-side shell-side-${side}${table && panel === "scenes" ? " shell-side-wide" : ""}${slides ? " is-overlay" : ""}`}
        data-panel={panel}
        data-placement={slides ? "overlay" : panels.placement[panel]}
        style={slides ? ({ "--overlay-width": `${openWidth(panel)}px` } as React.CSSProperties) : undefined}
      >
        <Panel
          title={table && panel === "scenes" ? "Shot list" : TITLES[panel]}
          side={side}
          actions={panel === "scenes" ? scenesActions : undefined}
          collapsed={collapsed}
          onToggleCollapsed={() => toggle(panel)}
        >
          {content[panel]}
        </Panel>
        {mode === "wide" && !collapsed && !(table && panel === "scenes") && (
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
    <div className="app-shell" data-shell={mode}>
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
          {/* A panel sliding over the script closes when the script is tapped. */}
          {overlay && openOne && !table && (
            <button type="button" className="shell-scrim" aria-label={`Close ${TITLES[openOne]}`} onClick={() => setCompactPanel(null)} />
          )}
        </section>
        {sidePanel("right")}
      </main>
    </div>
  );
}
