import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

const page = (name: string) => resolve(__dirname, `src/renderer/${name}.html`);

// Every dependency is a devDependency, so main and preload are fully bundled (no runtime node_modules).
export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          control: page("control"),
          bubble: page("bubble"),
          toolbar: page("toolbar"),
          countdown: page("countdown"),
        },
      },
    },
  },
});
