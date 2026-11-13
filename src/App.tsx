import { ConfirmDialog } from "./components/ConfirmDialog";
import { ContextMenuHost } from "./components/ContextMenu";
import { NoticeArea } from "./components/NoticeArea";
import { ScenePanel, ScenesViewSwitch } from "./components/scenes/ScenePanel";
import { ScriptPane } from "./components/pdf/ScriptPane";
import { PropertiesPanel } from "./components/properties/PropertiesPanel";
import { SettingsDialog } from "./components/settings/SettingsDialog";
import { AppShell } from "./components/shell/AppShell";
import { TopBar } from "./components/topbar/TopBar";
import { useEffect } from "react";
import * as commands from "./commands";
import { useGlobalShortcuts } from "./hooks/useGlobalShortcuts";

function App() {
  useGlobalShortcuts();
  useEffect(() => commands.startAutosaveAndOfferRestore(), []);

  return (
    <>
      <AppShell
        topBar={<TopBar />}
        notices={<NoticeArea />}
        properties={<PropertiesPanel />}
        script={<ScriptPane />}
        scenes={<ScenePanel />}
        scenesActions={<ScenesViewSwitch />}
      />
      <SettingsDialog />
      <ConfirmDialog />
      <ContextMenuHost />
    </>
  );
}

export default App;
