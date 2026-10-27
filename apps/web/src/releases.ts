import { LATEST_RELEASE_API } from "./links";

export type DesktopPlatform = "windows" | "mac" | "linux";
export type DownloadTarget =
  | "windows-x64"
  | "mac-arm64"
  | "mac-x64"
  | "linux-appimage"
  | "linux-deb";

export interface ReleaseAsset {
  name: string;
  size: number;
  url: string;
}

export interface DesktopRelease {
  version: string;
  publishedAt: string;
  assets: ReleaseAsset[];
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Validate release data and keep links restricted to this repository's release files. */
export function parseDesktopRelease(value: unknown): DesktopRelease {
  if (
    !object(value) ||
    value.draft !== false ||
    value.prerelease !== false ||
    typeof value.tag_name !== "string" ||
    !/^desktop-v\d+\.\d+\.\d+$/.test(value.tag_name) ||
    typeof value.published_at !== "string" ||
    !Number.isFinite(Date.parse(value.published_at)) ||
    !Array.isArray(value.assets)
  ) {
    throw new Error("The latest release information is unavailable.");
  }
  const tag = value.tag_name;
  const assets: ReleaseAsset[] = [];
  for (const asset of value.assets) {
    if (
      !object(asset) ||
      asset.state !== "uploaded" ||
      typeof asset.name !== "string" ||
      typeof asset.size !== "number" ||
      !Number.isSafeInteger(asset.size) ||
      asset.size <= 0 ||
      typeof asset.browser_download_url !== "string"
    )
      continue;
    try {
      const url = new URL(asset.browser_download_url);
      const expectedPath = `/bilimgram/kadr/releases/download/${tag}/${asset.name}`;
      if (
        url.protocol !== "https:" ||
        url.hostname !== "github.com" ||
        url.port ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        decodeURIComponent(url.pathname) !== expectedPath ||
        asset.name.includes("/") ||
        asset.name.includes("\\")
      )
        continue;
      assets.push({ name: asset.name, size: asset.size, url: url.href });
    } catch {
      // Ignore malformed or foreign asset URLs rather than presenting them as downloads.
    }
  }
  return { version: tag.slice("desktop-v".length), publishedAt: value.published_at, assets };
}

/** Resolve only installers for the current release; never offer blockmaps, update files, or source archives. */
export function releaseDownload(
  release: DesktopRelease,
  target: DownloadTarget,
): ReleaseAsset | undefined {
  const names: Record<DownloadTarget, string[]> = {
    "windows-x64": [`Kadr-Setup-${release.version}.exe`, `Kadr-${release.version}-win-x64.exe`],
    "mac-arm64": [`Kadr-${release.version}-mac-arm64.dmg`],
    "mac-x64": [`Kadr-${release.version}-mac-x64.dmg`],
    "linux-appimage": [
      `Kadr-${release.version}-linux-x86_64.AppImage`,
      `Kadr-${release.version}-linux-x64.AppImage`,
    ],
    "linux-deb": [
      `Kadr-${release.version}-linux-amd64.deb`,
      `Kadr-${release.version}-linux-x64.deb`,
    ],
  };
  return release.assets.find((asset) => names[target].includes(asset.name));
}

export function detectDesktopPlatform(userAgent: string): DesktopPlatform | null {
  if (/Android|iPhone|iPad|iPod/i.test(userAgent)) return null;
  if (/Windows/i.test(userAgent)) return "windows";
  if (/Macintosh|Mac OS X/i.test(userAgent)) return "mac";
  if (/Linux/i.test(userAgent)) return "linux";
  return null;
}

/** Read the current published release without cookies, credentials, or a bundled version number. */
export async function fetchLatestRelease(signal?: AbortSignal): Promise<DesktopRelease> {
  const response = await fetch(LATEST_RELEASE_API, {
    headers: { Accept: "application/vnd.github+json" },
    credentials: "omit",
    cache: "no-store",
    signal,
  }).catch(() => {
    throw new Error(
      "We couldn’t connect to the download service. Please check your connection and try again.",
    );
  });
  if (!response.ok) {
    throw new Error(
      response.status === 403 || response.status === 429
        ? "Update checks are temporarily busy. Please try again in a few minutes."
        : "We couldn’t check the latest version. Please try again.",
    );
  }
  const data: unknown = await response.json().catch(() => {
    throw new Error("The download information could not be read. Please try again.");
  });
  return parseDesktopRelease(data);
}
