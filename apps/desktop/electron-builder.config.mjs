// Packaging, signing and auto-update configuration (electron-builder). See docs/RELEASING.md.
import { createRequire } from "node:module";
import { loadReleaseEnv, updateFeedUrl } from "./scripts/release-env.mjs";

// package.json declares a range (pnpm catalog); package exactly the version the lockfile installed.
const electronVersion = createRequire(import.meta.url)("electron/package.json").version;
const feedUrl = updateFeedUrl(loadReleaseEnv());
if (!feedUrl) {
  console.warn(
    "[electron-builder] KADR_UPDATE_URL is not set: this build will not receive automatic updates.",
  );
}

/** @type {import("electron-builder").Configuration} */
export default {
  appId: "dev.kadr.desktop",
  productName: "Kadr",
  copyright: "Copyright © 2026 The Kadr Authors",
  electronVersion,
  directories: { output: "release/${version}", buildResources: "build" },
  files: ["out/**", "package.json"],
  asar: true,
  // No spaces in artifact names: they become URLs in the update feed.
  artifactName: "Kadr-${version}-${os}-${arch}.${ext}",

  // Compile-time hardening of the Electron binary (docs/PLAN.md §7).
  electronFuses: {
    runAsNode: false,
    enableCookieEncryption: true,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
    grantFileProtocolExtraPrivileges: false,
  },

  mac: {
    category: "public.app-category.productivity",
    hardenedRuntime: true,
    entitlements: "build/entitlements.mac.plist",
    entitlementsInherit: "build/entitlements.mac.plist",
    extendInfo: {
      NSCameraUsageDescription: "Kadr shows your camera in the recording bubble.",
      NSMicrophoneUsageDescription: "Kadr records your voice together with your screen.",
    },
    // The zip is what macOS auto-update (Squirrel.Mac) downloads; the dmg is for first installs.
    target: [
      { target: "dmg", arch: ["arm64", "x64"] },
      { target: "zip", arch: ["arm64", "x64"] },
    ],
  },
  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
  },
  nsis: {
    artifactName: "Kadr-Setup-${version}.${ext}",
    oneClick: false,
    // Per-user install: updates apply without an administrator prompt.
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    // Blockmaps let updates download only the changed parts of the installer.
    differentialPackage: true,
  },
  linux: {
    category: "AudioVideo",
    // AppImage updates itself; deb is updated through the package manager.
    target: [
      { target: "AppImage", arch: ["x64"] },
      { target: "deb", arch: ["x64"] },
    ],
  },

  // Installed apps poll this static feed (latest.yml, latest-mac.yml, latest-linux.yml, and
  // beta*.yml for prereleases). Builds without KADR_UPDATE_URL (forks, local packaging) ship no
  // feed, and the app reports updates as unavailable instead of polling someone else's server.
  publish: feedUrl ? [{ provider: "generic", url: feedUrl }] : null,
  // Stable releases also write beta*.yml, so beta testers move on to a stable release once it is
  // newer than their beta; prereleases (1.2.0-beta.1) write only beta*.yml.
  generateUpdatesFilesForAllChannels: true,
};
