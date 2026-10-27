import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { app } from "electron";
import { z } from "zod";
import type { Point } from "../shared/placement";

const WindowState = z.object({
  bubble: z.object({ x: z.number().int(), y: z.number().int() }).nullable(),
});
type WindowState = z.infer<typeof WindowState>;

/** Wait for a drag to settle before writing. */
const SAVE_DELAY_MS = 400;

/**
 * Where floating windows were left, kept apart from settings so a drag doesn't broadcast a
 * settings change to every window. Atomic writes (temp file + rename), like the settings store.
 */
export class WindowStateStore {
  private state: WindowState = { bubble: null };
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly file = join(app.getPath("userData"), "window-state.json")) {}

  async load(): Promise<void> {
    try {
      const parsed = WindowState.safeParse(JSON.parse(await readFile(this.file, "utf8")));
      if (parsed.success) this.state = parsed.data;
    } catch {
      // First launch, or an unreadable file: start from the defaults.
    }
  }

  get bubblePosition(): Point | null {
    return this.state.bubble;
  }

  rememberBubble(position: Point): void {
    this.state = {
      ...this.state,
      bubble: { x: Math.round(position.x), y: Math.round(position.y) },
    };
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.save(), SAVE_DELAY_MS);
  }

  /** Writes a pending change before the app exits (quit can't wait for async work). */
  flushSync(): void {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const temp = `${this.file}.tmp`;
      writeFileSync(temp, this.serialize(), "utf8");
      renameSync(temp, this.file);
    } catch (error) {
      console.error("Failed to save window positions:", error);
    }
  }

  private async save(): Promise<void> {
    this.timer = null;
    try {
      await mkdir(dirname(this.file), { recursive: true });
      const temp = `${this.file}.tmp`;
      await writeFile(temp, this.serialize(), "utf8");
      await rename(temp, this.file);
    } catch (error) {
      console.error("Failed to save window positions:", error);
    }
  }

  private serialize(): string {
    return `${JSON.stringify(this.state, null, 2)}\n`;
  }
}
