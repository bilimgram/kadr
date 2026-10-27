import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron, type ElectronApplication, expect, type Page, test } from "@playwright/test";

// Playwright loads this package's tests as CommonJS, so `import.meta` isn't available.
const appRoot = join(__dirname, "..");

let app: ElectronApplication;
let userDataDir: string;

/** The window showing `page` (control, bubble, toolbar), once it exists. */
async function windowFor(page: string): Promise<Page> {
  await expect
    .poll(() => app.windows().some((w) => w.url().endsWith(`/${page}.html`)), { timeout: 20_000 })
    .toBe(true);
  const win = app.windows().find((w) => w.url().endsWith(`/${page}.html`));
  if (!win) throw new Error(`No ${page} window`);
  return win;
}

/** Whether the BrowserWindow showing `page` is visible, asked from the main process. */
function isWindowVisible(page: string): Promise<boolean> {
  return app.evaluate(
    ({ BrowserWindow }, name) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().endsWith(`/${name}.html`))
        ?.isVisible() ?? false,
    page,
  );
}

/**
 * Evaluates `code` in the main world of the page showing `page`, through the main process.
 * Playwright's own page.evaluate can't see state like a video's stream under context isolation.
 */
function inPage<T>(page: string, code: string): Promise<T> {
  return app.evaluate(
    ({ BrowserWindow }, [name, script]) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().endsWith(`/${name}.html`))
        ?.webContents.executeJavaScript(script, true),
    [page, code] as const,
  ) as Promise<T>;
}

test.beforeEach(async () => {
  // A throwaway profile: real settings stay untouched, and the single-instance lock doesn't clash
  // with a Kadr that is already running.
  userDataDir = mkdtempSync(join(tmpdir(), "kadr-e2e-"));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && entry[0] !== "ELECTRON_RENDERER_URL",
    ),
  );
  app = await _electron.launch({
    // The app folder (package.json → out/main), like the installed app: real name and version.
    args: [appRoot, `--user-data-dir=${userDataDir}`],
    cwd: appRoot,
    env,
  });
});

test.afterEach(async () => {
  await app?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test("the production build serves the UI from kadr://app and talks to the main process", async () => {
  const panel = await windowFor("control");
  expect(panel.url()).toBe("kadr://app/control.html");

  // Rendered only after settings arrive over IPC: catches a rejected sender (v0.1.0's bug).
  await expect(panel.getByRole("button", { name: "Start recording" })).toBeVisible();
  await expect(panel.getByText("couldn't load its settings")).toHaveCount(0);

  await panel.getByRole("button", { name: "More" }).click();
  await expect(panel.getByText("Help and feedback")).toBeVisible();
  await expect(panel.getByRole("link", { name: /Report a problem/ })).toHaveAttribute(
    "href",
    /^https:\/\/github\.com\/bilimgram\/kadr\/issues\/new\?/,
  );
  // Esc returns to the main view.
  await panel.keyboard.press("Escape");
  await expect(panel.getByRole("button", { name: "Start recording" })).toBeVisible();
});

test("closing the panel hides it and the bubble, releasing the camera", async () => {
  const panel = await windowFor("control");
  await windowFor("bubble");
  await expect(panel.getByRole("button", { name: "Start recording" })).toBeVisible();
  await expect.poll(() => isWindowVisible("bubble")).toBe(true);

  // "live" with a camera, "unavailable" on machines without one (CI); never stuck "starting".
  const cameraState = () =>
    inPage<string>(
      "bubble",
      `(() => {
        if (document.querySelector(".bubble__error")) return "unavailable";
        const stream = document.querySelector("video")?.srcObject;
        const live = stream && stream.getTracks().some((track) => track.readyState === "live");
        return live ? "live" : "starting";
      })()`,
    );
  await expect.poll(cameraState, { timeout: 20_000 }).not.toBe("starting");

  await panel.getByRole("button", { name: /^Close/ }).click();

  await expect.poll(() => isWindowVisible("control")).toBe(false);
  await expect.poll(() => isWindowVisible("bubble")).toBe(false);
  // Hidden bubble: the camera (and its privacy light) is off.
  await expect.poll(cameraState).not.toBe("live");
});
