import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // GitHub Pages default; portable build sets VITE_BASE=./ via prepare-portable.mjs
  base: process.env.VITE_BASE || "/ShootingScriptLiner/",
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? "dev"),
    // Names the offline cache, so each build starts a fresh one and the old one is cleared.
    __BUILD_ID__: JSON.stringify(Date.now().toString(36)),
  },
});
