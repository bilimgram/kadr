import { describe, expect, it } from "vitest";
import { bubbleCameraEffects, recordingCameraEffects } from "./camera";
import { detectImageType } from "./images";
import { DEFAULT_SETTINGS, mergeSettings, parseStoredSettings } from "./settings";

const bubble = DEFAULT_SETTINGS.bubble;

describe("camera background settings", () => {
  it("defaults to no background effect and keeps older settings files working", () => {
    expect(bubble.background.mode).toBe("none");
    // Settings written before backgrounds existed have no "background" key.
    const { background: _omitted, ...older } = bubble;
    const parsed = parseStoredSettings({ bubble: { ...older, shape: "heart" } });
    expect(parsed.bubble.shape).toBe("heart");
    expect(parsed.bubble.background).toEqual(bubble.background);
  });

  it("rejects invalid backgrounds", () => {
    expect(() =>
      mergeSettings(DEFAULT_SETTINGS, {
        bubble: { background: { ...bubble.background, blur: 2 } },
      }),
    ).toThrow();
    expect(() =>
      mergeSettings(DEFAULT_SETTINGS, {
        bubble: { background: { ...bubble.background, mode: "sparkles" as "blur" } },
      }),
    ).toThrow();
  });
});

describe("camera effects from settings", () => {
  it("shows the room until a custom image exists", () => {
    const pending = { ...bubble, background: { ...bubble.background, mode: "image" as const } };
    expect(bubbleCameraEffects(pending).background.mode).toBe("none");
    const chosen = { ...pending, background: { ...pending.background, imageRevision: 5 } };
    expect(bubbleCameraEffects(chosen).background.mode).toBe("image");
  });

  it("records camera-only videos unmirrored and never transparent", () => {
    const removed = {
      ...bubble,
      mirror: true,
      background: { ...bubble.background, mode: "remove" as const, presetId: "ocean" },
    };
    expect(bubbleCameraEffects(removed)).toMatchObject({
      mirror: true,
      background: { mode: "remove" },
    });
    expect(recordingCameraEffects(removed)).toMatchObject({
      mirror: false,
      background: { mode: "color", presetId: "ocean" },
    });
  });
});

describe("background image types", () => {
  it("recognises PNG, JPEG and WebP by their signatures only", () => {
    expect(detectImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      "image/png",
    );
    expect(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
    expect(detectImageType(webp)).toBe("image/webp");
    expect(detectImageType(new TextEncoder().encode("<svg>"))).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
  });
});
