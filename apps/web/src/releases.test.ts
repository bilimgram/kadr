import { afterEach, describe, expect, it, vi } from "vitest";
import {
  detectDesktopPlatform,
  fetchLatestRelease,
  parseDesktopRelease,
  releaseDownload,
} from "./releases";

function asset(name: string, tag = "desktop-v0.1.0") {
  return {
    name,
    size: 123456,
    state: "uploaded",
    browser_download_url: `https://github.com/bilimgram/kadr/releases/download/${tag}/${name}`,
  };
}
function release(assets: unknown[], tag = "desktop-v0.1.0") {
  return {
    tag_name: tag,
    draft: false,
    prerelease: false,
    published_at: "2026-10-27T12:37:43Z",
    assets,
  };
}
afterEach(() => vi.unstubAllGlobals());

describe("desktop release downloads", () => {
  it("selects the exact installer for each supported platform and architecture", () => {
    const data = parseDesktopRelease(
      release([
        asset("Kadr-Setup-0.1.0.exe"),
        asset("Kadr-Setup-0.1.0.exe.blockmap"),
        asset("Kadr-0.1.0-mac-arm64.dmg"),
        asset("Kadr-0.1.0-mac-x64.dmg"),
        asset("Kadr-0.1.0-mac-arm64.zip"),
        asset("Kadr-0.1.0-linux-x86_64.AppImage"),
        asset("Kadr-0.1.0-linux-amd64.deb"),
        asset("latest.yml"),
      ]),
    );
    expect(releaseDownload(data, "windows-x64")?.name).toBe("Kadr-Setup-0.1.0.exe");
    expect(releaseDownload(data, "mac-arm64")?.name).toBe("Kadr-0.1.0-mac-arm64.dmg");
    expect(releaseDownload(data, "mac-x64")?.name).toBe("Kadr-0.1.0-mac-x64.dmg");
    expect(releaseDownload(data, "linux-appimage")?.name).toBe("Kadr-0.1.0-linux-x86_64.AppImage");
    expect(releaseDownload(data, "linux-deb")?.name).toBe("Kadr-0.1.0-linux-amd64.deb");
  });

  it("uses the returned future version rather than a version bundled with the website", () => {
    const tag = "desktop-v2.3.4";
    const data = parseDesktopRelease(release([asset("Kadr-Setup-2.3.4.exe", tag)], tag));
    expect(data.version).toBe("2.3.4");
    expect(releaseDownload(data, "windows-x64")?.url).toContain(
      "/desktop-v2.3.4/Kadr-Setup-2.3.4.exe",
    );
  });

  it("does not substitute the wrong processor, old version, or update metadata", () => {
    const data = parseDesktopRelease(
      release([
        asset("Kadr-0.1.0-mac-x64.dmg"),
        asset("Kadr-Setup-0.0.9.exe"),
        asset("latest.yml"),
      ]),
    );
    expect(releaseDownload(data, "mac-arm64")).toBeUndefined();
    expect(releaseDownload(data, "windows-x64")).toBeUndefined();
    expect(releaseDownload(data, "linux-deb")).toBeUndefined();
  });

  it("discards foreign repositories, hosts, URL credentials, and malformed assets", () => {
    const original = asset("Kadr-Setup-0.1.0.exe");
    const data = parseDesktopRelease(
      release([
        {
          ...original,
          browser_download_url: original.browser_download_url.replace("github.com", "evil.example"),
        },
        {
          ...original,
          browser_download_url: original.browser_download_url.replace(
            "/bilimgram/kadr/",
            "/someone/else/",
          ),
        },
        {
          ...original,
          browser_download_url: original.browser_download_url.replace(
            "https://",
            "https://user:secret@",
          ),
        },
        { ...original, state: "new" },
        { ...original, size: -1 },
        null,
      ]),
    );
    expect(data.assets).toEqual([]);
  });

  it("rejects draft, prerelease, and malformed release records", () => {
    for (const invalid of [
      null,
      {},
      { ...release([]), draft: true },
      { ...release([]), prerelease: true },
      { ...release([]), published_at: "invalid" },
      release([], "desktop-v0.2.0-beta.1"),
    ]) {
      expect(() => parseDesktopRelease(invalid)).toThrow();
    }
  });
});

describe("platform selection", () => {
  it("suggests the desktop OS while keeping all choices available", () => {
    expect(detectDesktopPlatform("Mozilla Windows NT 10.0 Win64")).toBe("windows");
    expect(detectDesktopPlatform("Mozilla Macintosh Intel Mac OS X")).toBe("mac");
    expect(detectDesktopPlatform("Mozilla X11 Linux x86_64")).toBe("linux");
    expect(detectDesktopPlatform("Mozilla Android Linux")).toBeNull();
    expect(detectDesktopPlatform("Mozilla iPhone like Mac OS X")).toBeNull();
    expect(detectDesktopPlatform("Unknown")).toBeNull();
  });
});

describe("latest release check", () => {
  it("requests live metadata without cookies or a cached bundled version", async () => {
    const request = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => release([asset("Kadr-Setup-0.1.0.exe")]) });
    vi.stubGlobal("fetch", request);
    expect((await fetchLatestRelease()).version).toBe("0.1.0");
    expect(request).toHaveBeenCalledWith(
      "https://api.github.com/repos/bilimgram/kadr/releases/latest",
      expect.objectContaining({ credentials: "omit", cache: "no-store" }),
    );
  });

  it("returns a recoverable message on rate limiting instead of offering stale downloads", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    await expect(fetchLatestRelease()).rejects.toThrow("Please try again in a few minutes");
  });

  it("surfaces network failure so the interface can offer retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network unavailable")));
    await expect(fetchLatestRelease()).rejects.toThrow(
      "Please check your connection and try again",
    );
  });
});
