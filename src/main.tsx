import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applyColorTheme, applyUiScale } from "./lib/appPreferences";
import { usePrefsStore } from "./stores/prefsStore";
import { getBundledFontLoadErrors, loadBundledFonts } from "./lib/fonts";
import "./index.css";

applyColorTheme(usePrefsStore.getState().colorTheme);
applyUiScale(usePrefsStore.getState().uiScale);
// Follow the device when the theme is set to System.
if (typeof matchMedia === "function") {
  matchMedia("(prefers-color-scheme: light)").addEventListener("change", () =>
    applyColorTheme(usePrefsStore.getState().colorTheme)
  );
}

void loadBundledFonts().then(() => {
  const errors = getBundledFontLoadErrors();
  if (errors.length > 0) {
    console.warn(
      `${errors.length} bundled font file(s) failed to load. See public/fonts/README.md\n` +
        errors.slice(0, 5).join("\n") +
        (errors.length > 5 ? `\n…and ${errors.length - 5} more` : "")
    );
  }
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
