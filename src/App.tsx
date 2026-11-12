import { ConfirmDialog } from "./components/ConfirmDialog";
import { NoticeArea } from "./components/NoticeArea";
import { SceneOutliner } from "./components/outliner/SceneOutliner";
import { ScriptPane } from "./components/pdf/ScriptPane";
import { PropertiesPanel } from "./components/properties/PropertiesPanel";
import { SettingsModal } from "./components/SettingsModal";
import { AppShell } from "./components/shell/AppShell";
import { TopBar } from "./components/topbar/TopBar";
import { useGlobalShortcuts } from "./hooks/useGlobalShortcuts";

function App() {
  useGlobalShortcuts();

  return (
    <>
      <AppShell
        topBar={<TopBar />}
        notices={<NoticeArea />}
        properties={<PropertiesPanel />}
        script={<ScriptPane />}
        scenes={<SceneOutliner />}
      />
      <SettingsModal />
      <ConfirmDialog />
    </>
  );
}

export default App;
