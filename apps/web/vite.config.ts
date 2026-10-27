import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages serves the app under /kadr/; local dev and other hosts use the root.
  base: process.env.KADR_WEB_BASE ?? "/",
  plugins: [react()],
});
