import { ConfirmDialog } from "./components/ConfirmDialog";
import { NoticeArea } from "./components/NoticeArea";
import { SceneOutliner } from "./components/outliner/SceneOutliner";
import { ScriptPane } from "./components/pdf/ScriptPane";
import { PropertiesPanel } from "./components/properties/PropertiesPanel";
import { SettingsModal } from "./components/SettingsModal";
import { AppShell } from "./components/shell/AppShell";
import { Toolbar } from "./components/Toolbar";
import { useGlobalShortcuts } from "./hooks/useGlobalShortcuts";
import { useSessionStore } from "./stores/sessionStore";

function App() {
  useGlobalShortcuts();
  const confirm = useSessionStore((s) => s.confirm);
  const setConfirm = useSessionStore((s) => s.setConfirm);

  return (
    <>
      <AppShell
        topBar={<Toolbar />}
        notices={<NoticeArea />}
        properties={<PropertiesPanel />}
        script={<ScriptPane />}
        scenes={<SceneOutliner />}
      />
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
    </>
  );
}

export default App;
