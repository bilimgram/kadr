import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
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

/**
 * A red always-on-top window from another process (it takes focus), standing in for another app's
 * call or video player. Resolves once it is on screen; kill the process to close it.
 */
async function showForeignWindow(rect: { x: number; y: number; width: number; height: number }) {
  const electronPath = require("electron") as unknown as string;
  const other = spawn(
    electronPath,
    [
      join(__dirname, "fixtures/foreign-window.cjs"),
      String(rect.x),
      String(rect.y),
      String(rect.width),
      String(rect.height),
    ],
    { stdio: ["ignore", "pipe", "ignore"] },
  );
  await new Promise<void>((resolve) =>
    other.stdout?.on("data", (data) => {
      if (String(data).includes("SHOWN")) resolve();
    }),
  );
  return other;
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

  // Another app's window covering the bubble and taking focus.
  const other = await showForeignWindow({
    x: bounds.x - 30,
    y: bounds.y - 30,
    width: bounds.width + 60,
    height: bounds.height + 60,
  });
  try {
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

/** The region picker overlay covering the primary display (there is one per display). */
async function primaryRegionPicker(): Promise<Page> {
  const primary = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().bounds);
  let picker: Page | undefined;
  await expect
    .poll(
      async () => {
        for (const win of app.windows()) {
          if (!win.url().endsWith("/region.html")) continue;
          const origin = await win.evaluate(() => [window.screenX, window.screenY]);
          if (origin[0] === primary.x && origin[1] === primary.y) picker = win;
        }
        return picker !== undefined;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  if (!picker) throw new Error("No region picker on the primary display");
  return picker;
}

function regionPickerCount(): Promise<number> {
  return app.evaluate(
    ({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().filter((w) => w.webContents.getURL().endsWith("/region.html"))
        .length,
  );
}

function sessionStatus(): Promise<string> {
  return inPage<string>("control", "window.kadr.session.get().then((s) => s.status)");
}

/** Width and height of the video track of an MP4 file, from its `tkhd` box. */
function mp4VideoSize(file: string): { width: number; height: number } | null {
  const data = readFileSync(file);
  for (let at = data.indexOf("tkhd"); at !== -1; at = data.indexOf("tkhd", at + 4)) {
    const end = at - 4 + data.readUInt32BE(at - 4);
    const width = data.readUInt32BE(end - 8) / 65536;
    const height = data.readUInt32BE(end - 4) / 65536;
    if (width > 0 && height > 0) return { width, height };
  }
  return null;
}

/** Screen only, no countdown, microphone or system audio: the tests need no camera or audio. */
const REGION_SETTINGS = `window.kadr.settings.update({
  recording: {
    mode: "screen",
    captureArea: "region",
    countdownSeconds: 0,
    microphoneEnabled: false,
    systemAudio: false,
  },
})`;

test("the region picker opens on Start, selects with the keyboard, and cancels cleanly", async () => {
  const panel = await windowFor("control");
  await expect(panel.getByRole("button", { name: "Start recording" })).toBeVisible();
  await inPage("control", REGION_SETTINGS);
  await expect(panel.getByRole("combobox", { name: "Recording source" })).toHaveValue("region");
  await expect(panel.getByText("You'll pick the area next")).toBeVisible();

  await panel.getByRole("button", { name: "Start recording" }).click();
  const picker = await primaryRegionPicker();
  await expect(picker.locator(".region__hint")).toContainText("Drag to select an area");
  await expect.poll(() => isWindowVisible("control")).toBe(false);
  expect(await regionPickerCount()).toBe(
    await app.evaluate(({ screen }) => screen.getAllDisplays().length),
  );

  // Ctrl+A selects the whole display; the label shows the video size in device pixels.
  const display = await app.evaluate(({ screen }) => {
    const { size, scaleFactor } = screen.getPrimaryDisplay();
    return { width: size.width * scaleFactor, height: size.height * scaleFactor };
  });
  await picker.getByRole("application", { name: "Select the area to record" }).focus();
  await picker.keyboard.press("Control+A");
  const even = (value: number) => Math.round(value / 2) * 2;
  await expect(picker.locator(".region__size")).toHaveText(
    `${even(display.width)} × ${even(display.height)}`,
  );
  await expect(picker.getByRole("toolbar", { name: "Recording area" })).toBeVisible();

  // Escape gives up: the pickers close and the panel comes back, idle. (Key down only: the window
  // is gone before a key up could reach it.)
  await picker.keyboard.down("Escape");
  await expect.poll(regionPickerCount).toBe(0);
  await expect.poll(() => isWindowVisible("control")).toBe(true);
  expect(await sessionStatus()).toBe("idle");
});

test("recording a region captures exactly that area and copies the file", async () => {
  // Real screen capture and encoding; checked on Windows, like the stacking test.
  test.skip(process.platform !== "win32", "Screen capture is checked on Windows");
  const panel = await windowFor("control");
  await expect(panel.getByRole("button", { name: "Start recording" })).toBeVisible();
  // Recordings go to a throwaway folder, and the user's clipboard text is put back afterwards.
  const videos = mkdtempSync(join(tmpdir(), "kadr-videos-"));
  await app.evaluate(({ app: electronApp }, dir) => electronApp.setPath("videos", dir), videos);
  const clipboardText = await app.evaluate(({ clipboard }) => clipboard.readText());
  try {
    await inPage("control", REGION_SETTINGS);
    await panel.getByRole("button", { name: "Start recording" }).click();
    const picker = await primaryRegionPicker();
    const scale = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().scaleFactor);
    const primary = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().bounds);

    // Draw a 400×300 DIP area with the mouse.
    await picker.mouse.move(200, 150);
    await picker.mouse.down();
    await picker.mouse.move(400, 300, { steps: 5 });
    await picker.mouse.move(600, 450, { steps: 5 });
    await picker.mouse.up();
    const expected = { width: Math.round(200 * scale) * 2, height: Math.round(150 * scale) * 2 };
    await expect(picker.locator(".region__size")).toHaveText(
      `${expected.width} × ${expected.height}`,
    );
    await expect(picker.getByRole("spinbutton", { name: "Width in pixels" })).toHaveValue(
      String(expected.width),
    );

    await picker.getByRole("button", { name: "Record", exact: true }).click();
    await expect.poll(sessionStatus, { timeout: 15_000 }).toBe("recording");
    expect(await regionPickerCount()).toBe(0);

    // A frame marks the area from just outside it.
    const frameBounds = () =>
      app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows().find((w) =>
          w.webContents.getURL().endsWith("/frame.html"),
        );
        return win?.isVisible() ? win.getBounds() : null;
      });
    await expect
      .poll(frameBounds)
      .toEqual({ x: primary.x + 196, y: primary.y + 146, width: 408, height: 308 });

    // Something recognisable in the left half of the area only: proves the crop is in the right
    // place, not just the right size.
    const marker = await showForeignWindow({
      x: primary.x + 200,
      y: primary.y + 150,
      width: 200,
      height: 300,
    });
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await inPage("control", "window.kadr.session.command('stop')");
      await expect.poll(sessionStatus, { timeout: 15_000 }).toBe("idle");
    } finally {
      marker.kill();
    }
    const result = await inPage<{ path: string; copied: boolean }>(
      "control",
      "window.kadr.session.get().then((s) => s.lastResult)",
    );

    expect(dirname(result.path)).toBe(join(videos, "Kadr"));
    expect(existsSync(result.path)).toBe(true);
    expect(mp4VideoSize(result.path)).toEqual(expected);
    // The last frame, decoded in the panel: red on the left (the marker), not on the right.
    const [left, right] = await inPage<number[][]>(
      "control",
      `(async () => {
        const bytes = Uint8Array.from(atob("${readFileSync(result.path).toString("base64")}"), (c) => c.charCodeAt(0));
        const video = document.createElement("video");
        video.muted = true;
        video.src = URL.createObjectURL(new Blob([bytes], { type: "video/mp4" }));
        video.playbackRate = 4;
        await video.play();
        await new Promise((resolve) => video.addEventListener("ended", resolve, { once: true }));
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext("2d");
        context.drawImage(video, 0, 0);
        const sample = (x) => Array.from(context.getImageData(Math.round(canvas.width * x), canvas.height / 2, 1, 1).data.slice(0, 3));
        URL.revokeObjectURL(video.src);
        return [sample(0.25), sample(0.75)];
      })()`,
    );
    const isRed = ([red = 0, green = 0, blue = 0]: number[]) =>
      red > 200 && green < 60 && blue < 60;
    expect(isRed(left ?? [])).toBe(true);
    expect(isRed(right ?? [])).toBe(false);

    // Copied by default, as a file the system pastes (CF_HDROP on Windows).
    expect(result.copied).toBe(true);
    const copied = await app.evaluate(async ({ clipboard }) => {
      const item = (await clipboard.read()).find((i) => i.types.includes("text/uri-list"));
      return item ? (await item.getType("text/uri-list")).text() : null;
    });
    expect(copied?.trim()).toBe(pathToFileURL(result.path).href);

    // The compact card: icon actions with tooltips (the accessible name is the tooltip text).
    const card = panel.getByRole("region", { name: "Last recording" });
    await expect(card.getByText("Saved and copied")).toBeVisible();
    for (const label of ["Open", "Copy to clipboard", "Show in folder"]) {
      await expect(card.getByRole("button", { name: label })).toHaveAttribute(
        "data-tooltip",
        label,
      );
    }
    await card.getByRole("button", { name: "Copy to clipboard" }).click();
    await expect(card.getByRole("button", { name: "Copied" })).toBeVisible();

    // Next time the picker starts from the same area.
    await panel.getByRole("button", { name: "Start recording" }).click();
    const again = await primaryRegionPicker();
    await expect(again.locator(".region__size")).toHaveText(
      `${expected.width} × ${expected.height}`,
    );
    await again.keyboard.down("Escape");
    await expect.poll(regionPickerCount).toBe(0);
  } finally {
    await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), clipboardText);
    rmSync(videos, { recursive: true, force: true });
  }
});
