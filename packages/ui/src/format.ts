/** Joins class names, skipping falsy values. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** "0:07", "12:34", "1:02:03". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** "512 B", "1.5 KB", "12.3 MB". */
export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return unit === 0 ? `${value} B` : `${value.toFixed(1)} ${units[unit]}`;
}

const MAC_KEYS: Record<string, string> = {
  Alt: "⌥",
  Option: "⌥",
  Shift: "⇧",
  Control: "⌃",
  Ctrl: "⌃",
  CommandOrControl: "⌘",
  CmdOrCtrl: "⌘",
  Command: "⌘",
  Cmd: "⌘",
};

/** Formats an Electron accelerator for display: "Alt+Shift+R" → "⌥⇧R" on macOS, "Alt+Shift+R" elsewhere. */
export function formatShortcut(accelerator: string, platform: string): string {
  const keys = accelerator.split("+");
  if (platform === "darwin") return keys.map((key) => MAC_KEYS[key] ?? key).join("");
  return keys
    .map((key) => (key === "CommandOrControl" || key === "CmdOrCtrl" ? "Ctrl" : key))
    .join("+");
}
