import { app, session, shell } from "electron";
import { isAllowedExternalUrl, isTrustedOrigin } from "../shared/origin";

const ALLOWED_PERMISSIONS = new Set(["media", "display-capture"]);

/**
 * Applies the security baseline from docs/ARCHITECTURE.md §3.2: permission allowlist, no navigation,
 * no new windows, no <webview>. Display capture is answered in main as well (see capture.ts).
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
