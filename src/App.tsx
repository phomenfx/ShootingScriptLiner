import { useCallback, useRef } from "react";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { PropertiesPanel } from "./components/properties/PropertiesPanel";
import { ScriptPane } from "./components/pdf/ScriptPane";
import { SettingsModal } from "./components/SettingsModal";
import { Toolbar } from "./components/Toolbar";
import { SceneOutliner } from "./components/outliner/SceneOutliner";
import { useProjectStore } from "./stores/projectStore";

function App() {
  const confirm = useProjectStore((s) => s.confirm);
  const setConfirm = useProjectStore((s) => s.setConfirm);
  const sidebarWidthPx = useProjectStore((s) => s.sidebarWidthPx);
  const setSidebarWidthPx = useProjectStore((s) => s.setSidebarWidthPx);
  const propertiesHeightPx = useProjectStore((s) => s.propertiesHeightPx);
  const setPropertiesHeightPx = useProjectStore((s) => s.setPropertiesHeightPx);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const propertiesDragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  const onSplitterPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startWidth: sidebarWidthPx };
      e.currentTarget.setPointerCapture(e.pointerId);
      document.body.classList.add("sidebar-resizing");
    },
    [sidebarWidthPx]
  );

  const onSplitterPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      // Sidebar is on the right: drag left → wider
      const next = drag.startWidth + (drag.startX - e.clientX);
      setSidebarWidthPx(next);
    },
    [setSidebarWidthPx]
  );

  const endSplitterDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    document.body.classList.remove("sidebar-resizing");
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }, []);

  const onPropertiesSplitterPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      propertiesDragRef.current = { startY: e.clientY, startHeight: propertiesHeightPx };
      e.currentTarget.setPointerCapture(e.pointerId);
      document.body.classList.add("properties-resizing");
    },
    [propertiesHeightPx]
  );

  const onPropertiesSplitterPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = propertiesDragRef.current;
      if (!drag) return;
      const paneHeight = sidebarRef.current?.clientHeight;
      // Properties sit above the shot list: drag down → taller
      const next = drag.startHeight + (e.clientY - drag.startY);
      setPropertiesHeightPx(next, paneHeight);
    },
    [setPropertiesHeightPx]
  );

  const endPropertiesSplitterDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!propertiesDragRef.current) return;
    propertiesDragRef.current = null;
    document.body.classList.remove("properties-resizing");
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }, []);

  return (
    <div className="app">
      <Toolbar />
      <main className="main-split">
        <section className="pane pane-pdf">
          <ScriptPane />
        </section>
        <div
          className="sidebar-splitter"
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={sidebarWidthPx}
          aria-label="Resize sidebar"
          title="Drag to resize sidebar"
          onPointerDown={onSplitterPointerDown}
          onPointerMove={onSplitterPointerMove}
          onPointerUp={endSplitterDrag}
          onPointerCancel={endSplitterDrag}
        />
        <section
          ref={sidebarRef}
          className="pane pane-outliner"
          style={{ width: sidebarWidthPx }}
        >
          <div className="properties-wrap" style={{ height: propertiesHeightPx }}>
            <PropertiesPanel />
          </div>
          <div
            className="properties-splitter"
            role="separator"
            aria-orientation="horizontal"
            aria-valuenow={propertiesHeightPx}
            aria-label="Resize properties panel"
            title="Drag to resize properties"
            onPointerDown={onPropertiesSplitterPointerDown}
            onPointerMove={onPropertiesSplitterPointerMove}
            onPointerUp={endPropertiesSplitterDrag}
            onPointerCancel={endPropertiesSplitterDrag}
          />
          <div className="outliner-wrap">
            <SceneOutliner />
          </div>
        </section>
      </main>
      <SettingsModal />
      {confirm && (
        <ConfirmDialog
          message={confirm.message}
          onYes={() => {
            confirm.onYes();
            setConfirm(null);
          }}
          onNo={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

export default App;
