import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrackRecorder } from "./track-recorder";

/** Minimal MediaRecorder stand-in: emits one chunk per `emit()` and on stop, like the real one. */
class FakeMediaRecorder extends EventTarget {
  static isTypeSupported = () => true;
  static last: FakeMediaRecorder | null = null;
  state: RecordingState = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;

  constructor() {
    super();
    FakeMediaRecorder.last = this;
  }

  start() {
    this.state = "recording";
  }

  pause() {
    this.state = "paused";
  }

  resume() {
    this.state = "recording";
  }

  emit(text: string) {
    this.ondataavailable?.({ data: new Blob([text]) });
  }

  stop() {
    this.emit("end");
    this.state = "inactive";
    this.dispatchEvent(new Event("stop"));
  }
}

const stream = {} as MediaStream;

describe("TrackRecorder", () => {
  beforeEach(() => {
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("delivers chunks to async handlers in order and returns the full recording", async () => {
    const delivered: string[] = [];
    const recorder = new TrackRecorder(stream, {
      mimeType: "video/webm",
      onChunk: async (chunk) => {
        const text = await chunk.text();
        await new Promise((resolve) => setTimeout(resolve, text === "a" ? 20 : 0));
        delivered.push(text);
      },
    });
    recorder.start();
    FakeMediaRecorder.last?.emit("a");
    FakeMediaRecorder.last?.emit("b");

    const blob = await recorder.stop();
    expect(delivered).toEqual(["a", "b", "end"]);
    expect(await blob.text()).toBe("abend");
    expect(blob.type).toBe("video/webm");
  });

  it("resolves stop() when the recorder never started", async () => {
    const recorder = new TrackRecorder(stream, { mimeType: "video/webm" });
    const blob = await recorder.stop();
    expect(blob.size).toBe(0);
  });

  it("rejects stop() when a chunk handler failed", async () => {
    const recorder = new TrackRecorder(stream, {
      mimeType: "video/webm",
      onChunk: () => {
        throw new Error("disk full");
      },
    });
    recorder.start();
    await expect(recorder.stop()).rejects.toThrow("disk full");
  });
});
