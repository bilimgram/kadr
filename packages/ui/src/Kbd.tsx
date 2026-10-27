import { formatShortcut } from "./format";

/** A keyboard shortcut hint, formatted for the current platform. */
export function Kbd({ shortcut, platform }: { shortcut: string; platform: string }) {
  return <kbd className="k-kbd">{formatShortcut(shortcut, platform)}</kbd>;
}
