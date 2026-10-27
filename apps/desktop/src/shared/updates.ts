import type { UpdateState } from "./schemas";

/** Turns updater failures into short messages a user can act on. */
export function describeUpdateError(error: unknown): string {
  const text =
    error instanceof Error
      ? `${error.message} ${String((error as { code?: string }).code ?? "")}`
      : String(error);
  if (
    /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|net::/i.test(
      text,
    )
  ) {
    return "Couldn't reach the update server. Kadr will try again later.";
  }
  if (/code signature|not signed|signature verification/i.test(text)) {
    return "This build isn't signed, so it can't install updates automatically.";
  }
  if (/sha512 checksum mismatch|checksum/i.test(text)) {
    return "The downloaded update was damaged and has been discarded. Kadr will try again later.";
  }
  if (/404|Cannot find .*\.yml/i.test(text)) {
    return "No updates have been published for this channel yet.";
  }
  const firstLine = text.split("\n")[0]?.trim() ?? "";
  return firstLine.length > 200 ? `${firstLine.slice(0, 197)}…` : firstLine || "Update failed.";
}

/** One-line status for the UI ("Up to date", "Downloading 42%", …). */
export function updateStatusText(state: UpdateState, now: number = Date.now()): string {
  switch (state.status) {
    case "disabled":
      return state.message ?? "Updates are unavailable in this build.";
    case "checking":
      return "Checking for updates…";
    case "available":
      return `Version ${state.availableVersion} found, preparing download…`;
    case "downloading":
      return `Downloading version ${state.availableVersion} · ${state.progress ?? 0}%`;
    case "downloaded":
      // A message here explains why "Restart to update" couldn't run yet.
      return state.message ?? `Version ${state.availableVersion} is ready to install`;
    case "up-to-date":
      return `Up to date · checked ${formatAgo(state.lastCheckedAt, now)}`;
    case "error":
      return state.message ?? "Update failed.";
    case "idle":
      return state.lastCheckedAt
        ? `Checked ${formatAgo(state.lastCheckedAt, now)}`
        : "Not checked yet";
  }
}

function formatAgo(timestamp: number | null, now: number): string {
  if (!timestamp) return "never";
  const minutes = Math.max(0, Math.round((now - timestamp) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}
