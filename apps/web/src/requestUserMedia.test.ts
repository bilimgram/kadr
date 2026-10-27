import { describe, expect, it, vi } from "vitest";
import { requestUserMedia } from "./requestUserMedia";

const stream = {} as MediaStream;

describe("camera and microphone permissions", () => {
  it("makes no device request when both camera and microphone are off", async () => {
    const request = vi.fn();
    expect(
      await requestUserMedia(request, { withCamera: false, withMicrophone: false }),
    ).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it("never requests the microphone when the user turns it off", async () => {
    const request = vi.fn().mockResolvedValue(stream);
    expect(await requestUserMedia(request, { withCamera: true, withMicrophone: false })).toBe(
      stream,
    );
    expect(request).toHaveBeenCalledWith({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  });

  it("preserves voice recording when a combined camera request is denied", async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error("Camera denied"))
      .mockResolvedValueOnce(stream);
    expect(await requestUserMedia(request, { withCamera: true, withMicrophone: true })).toBe(
      stream,
    );
    expect(request).toHaveBeenNthCalledWith(2, {
      video: false,
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("returns no stream when both permission requests fail", async () => {
    const request = vi.fn().mockRejectedValue(new Error("Devices denied"));
    expect(await requestUserMedia(request, { withCamera: true, withMicrophone: true })).toBeNull();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("does not retry a denied microphone-only request", async () => {
    const request = vi.fn().mockRejectedValue(new Error("Microphone denied"));
    expect(await requestUserMedia(request, { withCamera: false, withMicrophone: true })).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({
      video: false,
      audio: { echoCancellation: true, noiseSuppression: true },
    });
  });
});
