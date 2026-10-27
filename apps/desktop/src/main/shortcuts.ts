import { globalShortcut } from "electron";
import { type ActiveShortcuts, SHORTCUT_CANDIDATES, type ShortcutAction } from "../shared/api";

/** Registers the first free accelerator for each action; returns what was registered. */
export function registerShortcuts(actions: Record<ShortcutAction, () => void>): ActiveShortcuts {
  const active: ActiveShortcuts = { startStop: null, pauseResume: null };
  for (const action of Object.keys(SHORTCUT_CANDIDATES) as ShortcutAction[]) {
    active[action] =
      SHORTCUT_CANDIDATES[action].find((accelerator) =>
        globalShortcut.register(accelerator, actions[action]),
      ) ?? null;
    if (!active[action]) {
      console.warn(
        `No free global shortcut for "${action}"; every candidate is used by another app.`,
      );
    }
  }
  return active;
}
