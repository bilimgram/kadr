import { describe, expect, it } from "vitest";
import { APP_ORIGIN, isAllowedExternalUrl, isTrustedOrigin } from "./origin";

describe("isTrustedOrigin", () => {
  it("trusts packaged pages, whose origin Node reports as 'null'", () => {
    // Regression: v0.1.0 compared URL.origin, which is "null" for kadr:, so every IPC call from
    // the installed app was rejected (empty control panel, close button and camera not working).
    expect(new URL(`${APP_ORIGIN}/control.html`).origin).toBe("null");
    expect(isTrustedOrigin(`${APP_ORIGIN}/control.html`)).toBe(true);
    expect(isTrustedOrigin(`${APP_ORIGIN}/bubble.html#x`)).toBe(true);
    expect(isTrustedOrigin(APP_ORIGIN)).toBe(true); // permission checks pass bare origins
  });

  it("trusts the dev server only when one is configured", () => {
    expect(isTrustedOrigin("http://localhost:5173/control.html", "http://localhost:5173")).toBe(
      true,
    );
    expect(isTrustedOrigin("http://localhost:5173/control.html")).toBe(false);
    expect(isTrustedOrigin("http://localhost:5174/", "http://localhost:5173")).toBe(false);
  });

  it("rejects everything else", () => {
    for (const url of [
      undefined,
      "",
      "not a url",
      "kadr://evil/control.html",
      "kadr://app.evil.com/",
      "https://app/",
      "file:///C:/kadr/control.html",
      "https://example.com",
    ]) {
      expect(isTrustedOrigin(url, "http://localhost:5173")).toBe(false);
    }
  });
});

describe("isAllowedExternalUrl", () => {
  it("allows the project's own pages", () => {
    expect(isAllowedExternalUrl("https://github.com/bilimgram/kadr")).toBe(true);
    expect(isAllowedExternalUrl("https://github.com/bilimgram/kadr/issues/new?title=x")).toBe(true);
    expect(isAllowedExternalUrl("https://bilimgram.github.io/kadr/")).toBe(true);
  });

  it("rejects look-alikes and other sites", () => {
    expect(isAllowedExternalUrl("https://github.com/bilimgram/kadr-evil")).toBe(false);
    expect(isAllowedExternalUrl("https://github.com/someone/kadr")).toBe(false);
    expect(isAllowedExternalUrl("http://github.com/bilimgram/kadr")).toBe(false);
    expect(isAllowedExternalUrl("https://example.com/?https://github.com/bilimgram/kadr")).toBe(
      false,
    );
    expect(isAllowedExternalUrl("javascript:alert(1)")).toBe(false);
  });
});
