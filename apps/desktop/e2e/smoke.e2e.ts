import { spawn } from "node:child_process";
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

/** Starts Kadr on the test's profile (relaunching keeps its settings). */
async function launchApp(): Promise<ElectronApplication> {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && entry[0] !== "ELECTRON_RENDERER_URL",
    ),
  );
  return _electron.launch({
    // The app folder (package.json → out/main), like the installed app: real name and version.
    args: [appRoot, `--user-data-dir=${userDataDir}`],
    cwd: appRoot,
    env,
  });
}

test.beforeEach(async () => {
  // A throwaway profile: real settings stay untouched, and the single-instance lock doesn't clash
  // with a Kadr that is already running.
  userDataDir = mkdtempSync(join(tmpdir(), "kadr-e2e-"));
  app = await launchApp();
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

/** The bubble window as the main process sees it: shown, always on top, and fully on a display. */
function bubbleWindowState() {
  return app.evaluate(({ BrowserWindow, screen }) => {
    const win = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().endsWith("/bubble.html"),
    );
    if (!win) return "missing";
    const bounds = win.getBounds();
    const onScreen = screen.getAllDisplays().some(({ workArea: area }) => {
      return (
        bounds.x >= area.x &&
        bounds.y >= area.y &&
        bounds.x + bounds.width <= area.x + area.width &&
        bounds.y + bounds.height <= area.y + area.height
      );
    });
    if (!win.isVisible()) return "hidden";
    if (!win.isAlwaysOnTop()) return "not on top";
    return onScreen ? "shown" : "off screen";
  });
}

/** Reopens the panel the way a second launch (or the tray) does. */
function reopenPanel() {
  return app.evaluate(({ app: electronApp }) => {
    electronApp.emit("second-instance");
  });
}

test("the bubble comes back, on top, every time the panel is reopened", async () => {
  const panel = await windowFor("control");
  await windowFor("bubble");
  await expect(panel.getByRole("button", { name: "Start recording" })).toBeVisible();
  await expect.poll(bubbleWindowState).toBe("shown");

  for (let round = 0; round < 3; round++) {
    await panel.getByRole("button", { name: /^Close/ }).click();
    await expect.poll(bubbleWindowState).toBe("hidden");
    await reopenPanel();
    await expect.poll(() => isWindowVisible("control")).toBe(true);
    await expect.poll(bubbleWindowState).toBe("shown");
  }
});

test("changing bubble settings keeps the bubble shown and on top", async () => {
  const panel = await windowFor("control");
  await windowFor("bubble");
  await expect(panel.getByRole("button", { name: "Start recording" })).toBeVisible();
  await expect.poll(bubbleWindowState).toBe("shown");

  await panel.getByRole("button", { name: "Bubble" }).click();
  for (const shape of ["Hexagon", "16:9 card", "9:16 portrait", "Heart", "Circle"]) {
    // Click the visible option, like a user (the native radio is visually hidden).
    await panel.locator(`label[title="${shape}"]`).click();
    await expect(panel.getByRole("radio", { name: shape })).toBeChecked();
    await expect.poll(bubbleWindowState).toBe("shown");
  }
  for (const size of ["Large", "Small", "Medium"]) {
    await panel.locator("label.k-segmented__option", { hasText: size }).click();
    await expect(panel.getByRole("radio", { name: size })).toBeChecked();
    await expect.poll(bubbleWindowState).toBe("shown");
  }
  for (const toggle of ["Light correction", "Mirror camera"]) {
    const control = panel.getByRole("switch", { name: toggle });
    const before = await control.isChecked();
    for (const expected of [!before, before]) {
      // The visible track, like a user (the native checkbox is visually hidden).
      await panel
        .locator("label.k-switch", { hasText: toggle })
        .locator(".k-switch__track")
        .click();
      await expect(control).toBeChecked({ checked: expected });
      await expect.poll(bubbleWindowState).toBe("shown");
    }
  }
});

test("the bubble returns where the user left it after quitting and relaunching", async () => {
  await windowFor("control");
  await windowFor("bubble");
  await expect.poll(bubbleWindowState).toBe("shown");
  // Move the bubble like a drag would, then quit.
  const moved = await app.evaluate(({ BrowserWindow, screen }) => {
    const win = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().endsWith("/bubble.html"),
    );
    const area = screen.getPrimaryDisplay().workArea;
    const target = { x: area.x + 120, y: area.y + 140 };
    win?.setPosition(target.x, target.y);
    win?.emit("moved");
    return target;
  });
  await app.close();

  app = await launchApp();
  await windowFor("control");
  await windowFor("bubble");
  await expect.poll(bubbleWindowState).toBe("shown");
  const position = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().endsWith("/bubble.html"),
    );
    const [x, y] = win?.getPosition() ?? [0, 0];
    return { x, y };
  });
  expect(position).toEqual(moved);
});

test("the bubble stays above another app's always-on-top window", async () => {
  // Windows-only: Linux CI has no window manager to enforce always-on-top stacking.
  test.skip(process.platform !== "win32", "Window stacking is checked on Windows");
  await windowFor("control");
  await windowFor("bubble");
  await expect.poll(bubbleWindowState).toBe("shown");
  const bounds = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().endsWith("/bubble.html"))
      ?.getBounds(),
  );
  if (!bounds) throw new Error("No bubble window");

  // A red always-on-top window from another process, covering the bubble and taking focus.
  const electronPath = require("electron") as unknown as string;
  const other = spawn(
    electronPath,
    [
      join(__dirname, "fixtures/foreign-window.cjs"),
      String(bounds.x - 30),
      String(bounds.y - 30),
      String(bounds.width + 60),
      String(bounds.height + 60),
    ],
    { stdio: ["ignore", "pipe", "ignore"] },
  );
  try {
    await new Promise<void>((resolve) =>
      other.stdout?.on("data", (data) => {
        if (String(data).includes("SHOWN")) resolve();
      }),
    );
    // What is actually on screen at the bubble's centre, from a real screen capture.
    const pixelAtBubble = () =>
      app.evaluate(async ({ desktopCapturer, screen }, rect) => {
        const display = screen.getDisplayMatching(rect);
        const scale = display.scaleFactor;
        const [source] = await desktopCapturer.getSources({
          types: ["screen"],
          thumbnailSize: {
            width: display.size.width * scale,
            height: display.size.height * scale,
          },
        });
        const x = Math.round((rect.x - display.bounds.x + rect.width / 2) * scale);
        const y = Math.round((rect.y - display.bounds.y + rect.height / 2) * scale);
        const [blue = 0, green = 0, red = 0] =
          source?.thumbnail.crop({ x, y, width: 1, height: 1 }).toBitmap() ?? [];
        return red > 200 && green < 60 && blue < 60 ? "covered" : "bubble";
      }, bounds);
    await expect.poll(pixelAtBubble, { timeout: 5_000 }).toBe("bubble");
  } finally {
    other.kill();
  }
});
