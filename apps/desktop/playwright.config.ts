import { defineConfig } from "@playwright/test";

// End-to-end smoke tests against the production build (`electron-vite build`), which loads pages
// from kadr://app like the installed app. Run with `corepack pnpm --filter @kadr/desktop test:e2e`.
export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
});
