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

  return (
    <div className="app">
      <Toolbar />
      <main className="main-split">
        <section className="pane pane-pdf">
          <ScriptPane />
        </section>
        <section className="pane pane-outliner">
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
