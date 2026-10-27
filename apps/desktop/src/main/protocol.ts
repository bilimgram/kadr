import { isAbsolute, join, normalize, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { net, protocol } from "electron";

export const APP_SCHEME = "kadr";
export const APP_ORIGIN = `${APP_SCHEME}://app`;

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: mediastream:",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

/** Must run before `app.ready`. A standard, secure scheme gets a real origin and a secure context. */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
    },
  ]);
}

/** Serves the built renderer from `kadr://app/` with a strict CSP instead of loading `file://` URLs. */
export function serveRenderer(rootDir: string): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.host !== "app") return new Response("Not found", { status: 404 });

    const filePath = normalize(join(rootDir, decodeURIComponent(url.pathname)));
    const pathFromRoot = relative(rootDir, filePath);
    if (pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) {
      return new Response("Forbidden", { status: 403 });
    }

    const response = await net.fetch(pathToFileURL(filePath).toString());
    const headers = new Headers(response.headers);
    headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(response.body, { status: response.status, headers });
  });
}
