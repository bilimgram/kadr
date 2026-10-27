import { describe, expect, it } from "vitest";
import type { UpdateState } from "./schemas";
import { DEFAULT_SETTINGS, mergeSettings, parseStoredSettings } from "./settings";
import { describeUpdateError, updateStatusText } from "./updates";

const NOW = Date.UTC(2026, 9, 27, 12, 0, 0);
const base: UpdateState = {
  status: "idle",
  currentVersion: "1.2.0",
  availableVersion: null,
  progress: null,
  lastCheckedAt: null,
  message: null,
};

describe("describeUpdateError", () => {
  it("explains network failures without technical detail", () => {
    const offline = Object.assign(new Error("getaddrinfo ENOTFOUND updates.example.com"), {
      code: "ENOTFOUND",
    });
    expect(describeUpdateError(offline)).toMatch(/couldn't reach the update server/i);
    expect(describeUpdateError(new Error("net::ERR_INTERNET_DISCONNECTED"))).toMatch(
      /couldn't reach/i,
    );
  });

  it("recognises unsigned macOS builds, damaged downloads and empty feeds", () => {
    expect(
      describeUpdateError(new Error("Could not get code signature for running application")),
    ).toMatch(/isn't signed/);
    expect(describeUpdateError(new Error("sha512 checksum mismatch, expected abc"))).toMatch(
      /damaged/,
    );
    expect(
      describeUpdateError(new Error('Cannot find channel "beta.yml" update info: HttpError: 404')),
    ).toMatch(/no updates have been published/i);
  });

  it("falls back to the first line, truncated", () => {
    expect(describeUpdateError(new Error("Something odd\n    at stack frame"))).toBe(
      "Something odd",
    );
    expect(describeUpdateError("x".repeat(300))).toHaveLength(198);
    expect(describeUpdateError("")).toBe("Update failed.");
  });
});

describe("updateStatusText", () => {
  it("describes each state", () => {
    expect(updateStatusText(base, NOW)).toBe("Not checked yet");
    expect(updateStatusText({ ...base, status: "checking" }, NOW)).toBe("Checking for updates…");
    expect(
      updateStatusText(
        { ...base, status: "downloading", availableVersion: "1.3.0", progress: 42 },
        NOW,
      ),
    ).toBe("Downloading version 1.3.0 · 42%");
    expect(
      updateStatusText({ ...base, status: "downloaded", availableVersion: "1.3.0" }, NOW),
    ).toBe("Version 1.3.0 is ready to install");
    // Regression: a refused "Restart to update" must be visible, not an unhandled rejection.
    expect(
      updateStatusText(
        { ...base, status: "downloaded", availableVersion: "1.3.0", message: "Finish first" },
        NOW,
      ),
    ).toBe("Finish first");
    expect(updateStatusText({ ...base, status: "error", message: "Offline" }, NOW)).toBe("Offline");
    expect(updateStatusText({ ...base, status: "disabled", message: "No feed" }, NOW)).toBe(
      "No feed",
    );
  });

  it("says how long ago the last check was", () => {
    const checked = (msAgo: number) =>
      updateStatusText({ ...base, status: "up-to-date", lastCheckedAt: NOW - msAgo }, NOW);
    expect(checked(10_000)).toBe("Up to date · checked just now");
    expect(checked(5 * 60_000)).toBe("Up to date · checked 5 min ago");
    expect(checked(3 * 3_600_000)).toBe("Up to date · checked 3 h ago");
    expect(checked(2 * 86_400_000)).toBe("Up to date · checked 2 d ago");
  });
});

describe("update settings", () => {
  it("default to automatic stable updates and survive bad stored values", () => {
    expect(DEFAULT_SETTINGS.updates).toEqual({ channel: "stable", automatic: true });
    const stored = parseStoredSettings({ ...DEFAULT_SETTINGS, updates: { channel: "nightly" } });
    expect(stored.updates).toEqual(DEFAULT_SETTINGS.updates);
    expect(mergeSettings(DEFAULT_SETTINGS, { updates: { channel: "beta" } }).updates).toEqual({
      channel: "beta",
      automatic: true,
    });
  });
});
