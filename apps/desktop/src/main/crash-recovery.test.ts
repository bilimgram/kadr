import type { WebContents } from "electron";
import { describe, expect, it } from "vitest";
import { recoverRenderer } from "./crash-recovery";

function fakeContents() {
  let reloads = 0;
  const contents = {
    isDestroyed: () => false,
    reload: () => {
      reloads += 1;
    },
  } as unknown as WebContents;
  return { contents, reloads: () => reloads };
}

describe("recoverRenderer", () => {
  it("reloads a crashed window, but not a clean exit", () => {
    const { contents, reloads } = fakeContents();
    expect(recoverRenderer(contents, "clean-exit", 0)).toBe(false);
    expect(recoverRenderer(contents, "crashed", 0)).toBe(true);
    expect(reloads()).toBe(1);
  });

  it("stops after three crashes a minute, then allows reloads again", () => {
    const { contents, reloads } = fakeContents();
    for (const at of [0, 1_000, 2_000]) expect(recoverRenderer(contents, "crashed", at)).toBe(true);
    expect(recoverRenderer(contents, "oom", 3_000)).toBe(false);
    expect(recoverRenderer(contents, "crashed", 61_000)).toBe(true);
    expect(reloads()).toBe(4);
  });
});
