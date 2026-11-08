import * as electron from "electron";
import { describe, expect, it } from "vitest";

describe("electron in unit tests", () => {
  // Importing the real package outside Electron downloads its binary when it's missing, and
  // parallel workers racing to unpack it failed CI on Windows.
  it("resolves to the stand-in, never the real package", () => {
    expect((electron as unknown as { isUnitTestStub?: boolean }).isUnitTestStub).toBe(true);
  });

  it("fails loudly when a test reaches an Electron API", () => {
    expect(() => electron.app.getPath("userData")).toThrow("isn't available in unit tests");
  });
});
