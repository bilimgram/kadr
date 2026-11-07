import { globalShortcut } from "electron";
import { type ActiveShortcuts, SHORTCUT_CANDIDATES, type ShortcutAction } from "../shared/api";

/**
 * Global shortcuts: registers the first free accelerator for an action and reports what it got.
 * Some shortcuts are only held while recording (the note shortcut), so other apps keep them
 * otherwise; every change is reported through `onChange`.
 */
export class ShortcutRegistry {
  private readonly active: ActiveShortcuts = { startStop: null, pauseResume: null, addNote: null };

  constructor(
    private readonly actions: Record<ShortcutAction, () => void>,
    private readonly onChange: (active: ActiveShortcuts) => void = () => undefined,
  ) {}

  get(): ActiveShortcuts {
    return { ...this.active };
  }

  register(action: ShortcutAction): void {
    if (this.active[action]) return;
    this.active[action] =
      SHORTCUT_CANDIDATES[action].find((accelerator) =>
        globalShortcut.register(accelerator, this.actions[action]),
      ) ?? null;
    if (!this.active[action]) {
      console.warn(
        `No free global shortcut for "${action}"; every candidate is used by another app.`,
      );
    }
    this.onChange(this.get());
  }

  unregister(action: ShortcutAction): void {
    const accelerator = this.active[action];
    if (!accelerator) return;
    globalShortcut.unregister(accelerator);
    this.active[action] = null;
    this.onChange(this.get());
  }
}
