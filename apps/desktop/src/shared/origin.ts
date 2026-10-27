/** The packaged renderer is served from `kadr://app/` (see main/protocol.ts). */
export const APP_SCHEME = "kadr";
export const APP_HOST = "app";
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

/**
 * True for pages of the packaged app, and for the Vite dev server during development.
 *
 * Compares scheme and host rather than `URL.origin`: Node's URL reports the origin of custom
 * schemes like `kadr:` as the string "null", so an origin comparison rejects every packaged page.
 */
export function isTrustedOrigin(url: string | undefined, devServerUrl?: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === `${APP_SCHEME}:`) return parsed.host === APP_HOST;
    return !!devServerUrl && parsed.origin === new URL(devServerUrl).origin;
  } catch {
    return false;
  }
}

/** Project pages the app may open in the browser (help, issues, privacy); nothing else. */
const EXTERNAL_URL_PREFIXES = [
  "https://github.com/bilimgram/kadr",
  "https://bilimgram.github.io/kadr",
];

/** True when a link from the app may be opened in the user's browser. */
export function isAllowedExternalUrl(url: string): boolean {
  try {
    const { href } = new URL(url);
    return EXTERNAL_URL_PREFIXES.some(
      (prefix) => href === prefix || href.startsWith(`${prefix}/`) || href.startsWith(`${prefix}?`),
    );
  } catch {
    return false;
  }
}
