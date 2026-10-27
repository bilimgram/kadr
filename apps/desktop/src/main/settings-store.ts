import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { app } from "electron";
import type { AppSettings, AppSettingsPatch } from "../shared/api";
import { DEFAULT_SETTINGS, mergeSettings, parseStoredSettings } from "../shared/settings";

/** Persists settings as JSON in the user data folder; writes are atomic (temp file + rename). */
export class SettingsStore {
  private current: AppSettings = DEFAULT_SETTINGS;
  private writes: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<(settings: AppSettings) => void>();

  constructor(private readonly file = join(app.getPath("userData"), "settings.json")) {}

  async load(): Promise<AppSettings> {
    try {
      this.current = parseStoredSettings(JSON.parse(await readFile(this.file, "utf8")));
    } catch {
      this.current = DEFAULT_SETTINGS;
    }
    return this.current;
  }

  get(): AppSettings {
    return this.current;
  }

  update(patch: AppSettingsPatch): AppSettings {
    this.current = mergeSettings(this.current, patch);
    this.persist(this.current);
    for (const listener of this.listeners) listener(this.current);
    return this.current;
  }

  onChange(listener: (settings: AppSettings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private persist(settings: AppSettings): void {
    const data = `${JSON.stringify(settings, null, 2)}\n`;
    this.writes = this.writes
      .then(async () => {
        await mkdir(dirname(this.file), { recursive: true });
        const temp = `${this.file}.tmp`;
        await writeFile(temp, data, "utf8");
        await rename(temp, this.file);
      })
      .catch((error: unknown) => console.error("Failed to save settings:", error));
  }
}
