import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { getBundledFontLoadErrors, loadBundledFonts } from "./lib/fonts";
import "./index.css";

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
