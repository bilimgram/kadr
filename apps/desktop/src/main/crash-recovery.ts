import type { WebContents } from "electron";

/** At most this many automatic reloads per window within the window below, to avoid crash loops. */
const MAX_RELOADS = 3;
const RELOAD_WINDOW_MS = 60_000;

const reloads = new WeakMap<WebContents, number[]>();

/**
 * Reloads a window whose renderer crashed or was killed, so it never stays blank. Returns whether
 * a reload was started.
 */
export function recoverRenderer(contents: WebContents, reason: string, now = Date.now()): boolean {
  if (reason === "clean-exit" || contents.isDestroyed()) return false;
  const recent = (reloads.get(contents) ?? []).filter((at) => now - at < RELOAD_WINDOW_MS);
  if (recent.length >= MAX_RELOADS) return false;
  reloads.set(contents, [...recent, now]);
  contents.reload();
  return true;
}
