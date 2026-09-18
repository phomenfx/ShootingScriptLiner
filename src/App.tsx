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
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

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
          className="pane pane-outliner"
          style={{ width: sidebarWidthPx }}
        >
          <div className="properties-wrap">
            <PropertiesPanel />
          </div>
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
