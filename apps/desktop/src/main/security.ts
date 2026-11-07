import { app, session, shell } from "electron";
import { isAllowedExternalUrl, isTrustedOrigin } from "../shared/origin";

const ALLOWED_PERMISSIONS = new Set(["media", "display-capture"]);

/**
 * Hosts Kadr never talks to, even in dev mode (where pages have no CSP). MediaPipe Tasks 1.x
 * reports usage metrics here on its own; Kadr pins a release without that code (ADR 0009), and this
 * keeps a future upgrade from silently sending anything.
 */
export const BLOCKED_REQUEST_URLS = ["https://odml.pa.googleapis.com/*"];

/**
 * Applies the security baseline from docs/ARCHITECTURE.md §3.2: permission allowlist, no navigation,
 * no new windows, no <webview>. Display capture is answered in main as well (see capture.ts).
 */
export function hardenApp(devServerUrl?: string): void {
  const ses = session.defaultSession;

  ses.webRequest.onBeforeRequest({ urls: BLOCKED_REQUEST_URLS }, (_details, callback) => {
    callback({ cancel: true });
  });

  ses.setPermissionRequestHandler((_contents, permission, callback, details) => {
    callback(
      ALLOWED_PERMISSIONS.has(permission) && isTrustedOrigin(details.requestingUrl, devServerUrl),
    );
  });
  ses.setPermissionCheckHandler(
    (_contents, permission, requestingOrigin) =>
      ALLOWED_PERMISSIONS.has(permission) && isTrustedOrigin(requestingOrigin, devServerUrl),
  );

  app.on("web-contents-created", (_event, contents) => {
    contents.on("will-navigate", (event, url) => {
      if (!isTrustedOrigin(url, devServerUrl)) event.preventDefault();
    });
    contents.on("will-attach-webview", (event) => event.preventDefault());
    contents.setWindowOpenHandler(({ url }) => {
      if (isAllowedExternalUrl(url)) void shell.openExternal(url);
      return { action: "deny" };
    });
  });
}
