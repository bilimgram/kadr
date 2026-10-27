import { AppSettings, AppSettingsPatch } from "./schemas";

export const DEFAULT_SETTINGS: AppSettings = {
  bubble: { visible: true, shape: "circle", size: "medium", mirror: true, touchUp: true },
  recording: {
    mode: "screenAndCamera",
    countdownSeconds: 3,
    countdownSound: true,
    microphoneEnabled: true,
    systemAudio: true,
  },
  appearance: { theme: "light" },
  updates: { channel: "stable", automatic: true },
  system: { openAtLogin: false },
};

/** Applies a partial update; the result is validated so invalid combinations never persist. */
export function mergeSettings(base: AppSettings, patch: AppSettingsPatch): AppSettings {
  return AppSettings.parse({
    bubble: { ...base.bubble, ...patch.bubble },
    recording: { ...base.recording, ...patch.recording },
    appearance: { ...base.appearance, ...patch.appearance },
    updates: { ...base.updates, ...patch.updates },
    system: { ...base.system, ...patch.system },
  });
}

/**
 * Reads settings from disk content. Unknown or invalid data falls back to defaults section by
 * section, so a corrupted file or an older format never prevents the app from starting.
 */
export function parseStoredSettings(json: unknown): AppSettings {
  const record = typeof json === "object" && json !== null ? (json as Record<string, unknown>) : {};
  const bubble = AppSettingsPatch.shape.bubble.safeParse(record.bubble);
  const recording = AppSettingsPatch.shape.recording.safeParse(record.recording);
  const appearance = AppSettingsPatch.shape.appearance.safeParse(record.appearance);
  const updates = AppSettingsPatch.shape.updates.safeParse(record.updates);
  const system = AppSettingsPatch.shape.system.safeParse(record.system);
  try {
    return mergeSettings(DEFAULT_SETTINGS, {
      bubble: bubble.success ? bubble.data : undefined,
      recording: recording.success ? recording.data : undefined,
      appearance: appearance.success ? appearance.data : undefined,
      updates: updates.success ? updates.data : undefined,
      system: system.success ? system.data : undefined,
    });
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** The bubble window is shown when the camera is on and the mode uses the camera. */
export function isBubbleShown(settings: AppSettings): boolean {
  return settings.bubble.visible && settings.recording.mode !== "screen";
}
