import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // GitHub Pages default; portable build sets VITE_BASE=./ via prepare-portable.mjs
  base: process.env.VITE_BASE || "/ShootingScriptLiner/",
  plugins: [react()],
});
