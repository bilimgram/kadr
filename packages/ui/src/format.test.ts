import { describe, expect, it } from "vitest";
import { cx, formatBytes, formatDuration, formatShortcut } from "./format";

describe("formatDuration", () => {
  it("formats minutes and hours", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(7_900)).toBe("0:07");
    expect(formatDuration(754_000)).toBe("12:34");
    expect(formatDuration(3_723_000)).toBe("1:02:03");
    expect(formatDuration(-5)).toBe("0:00");
  });
});

describe("formatBytes", () => {
  it("uses binary units with one decimal", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(12.3 * 1024 * 1024)).toBe("12.3 MB");
  });
});

describe("formatShortcut", () => {
  it("uses symbols on macOS and words elsewhere", () => {
    expect(formatShortcut("Alt+Shift+R", "darwin")).toBe("⌥⇧R");
    expect(formatShortcut("Alt+Shift+R", "win32")).toBe("Alt+Shift+R");
    expect(formatShortcut("CommandOrControl+Shift+P", "linux")).toBe("Ctrl+Shift+P");
  });
});

describe("cx", () => {
  it("skips falsy class names", () => {
    expect(cx("a", false, null, undefined, "b")).toBe("a b");
  });
});
