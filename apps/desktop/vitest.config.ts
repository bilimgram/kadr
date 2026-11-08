import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Unit tests run in Node, not Electron: see test/electron.ts.
    alias: { electron: fileURLToPath(new URL("./test/electron.ts", import.meta.url)) },
  },
});
