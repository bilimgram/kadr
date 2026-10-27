import { app, desktopCapturer, screen, session, shell } from "electron";
import { APP_ORIGIN } from "./protocol";

const ALLOWED_PERMISSIONS = new Set(["media", "display-capture"]);

/** True for the packaged app origin, and for the Vite dev server origin during development. */
export function isTrustedOrigin(url: string | undefined, devServerUrl?: string): boolean {
  if (!url) return false;
  try {
    const origin = new URL(url).origin;
    return origin === APP_ORIGIN || (!!devServerUrl && origin === new URL(devServerUrl).origin);
  } catch {
    return false;
  }
}

/**
 * Applies the security baseline from docs/ARCHITECTURE.md §3.2: permission allowlist, no navigation,
 * no new windows, no <webview>, and main-process control over display capture.
 */
export function hardenApp(devServerUrl?: string): void {
  const ses = session.defaultSession;

  ses.setPermissionRequestHandler((_contents, permission, callback, details) => {
    callback(
      ALLOWED_PERMISSIONS.has(permission) && isTrustedOrigin(details.requestingUrl, devServerUrl),
    );
  });
  ses.setPermissionCheckHandler(
    (_contents, permission, requestingOrigin) =>
      ALLOWED_PERMISSIONS.has(permission) && isTrustedOrigin(requestingOrigin, devServerUrl),
  );

  // Phase 0: always the primary screen. Phase 1 adds a source picker (screen / window / region).
  ses.setDisplayMediaRequestHandler(async (request, callback) => {
    if (!isTrustedOrigin(request.securityOrigin, devServerUrl)) return callback({});
    const sources = await desktopCapturer.getSources({ types: ["screen"] });
    const primaryId = String(screen.getPrimaryDisplay().id);
    const source = sources.find((s) => s.display_id === primaryId) ?? sources[0];
    if (!source) return callback({});
    // System audio loopback is only supported on Windows; macOS needs the native core (Phase 4).
    const loopback = request.audioRequested && process.platform === "win32";
    callback(loopback ? { video: source, audio: "loopback" } : { video: source });
  });

  app.on("web-contents-created", (_event, contents) => {
    contents.on("will-navigate", (event, url) => {
      if (!isTrustedOrigin(url, devServerUrl)) event.preventDefault();
    });
    contents.on("will-attach-webview", (event) => event.preventDefault());
    contents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith("https://")) void shell.openExternal(url);
      return { action: "deny" };
    });
  });
}
