// Runs in the AudioWorkletGlobalScope (see notes-recorder.ts). Copies microphone samples out in
// blocks of 64 ms, so the main thread isn't woken for every 8 ms render quantum.

declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  abstract process(inputs: Float32Array[][]): boolean;
}
declare function registerProcessor(name: string, processor: new () => AudioWorkletProcessor): void;

const BLOCK_SAMPLES = 1024;

class MicTap extends AudioWorkletProcessor {
  private block = new Float32Array(BLOCK_SAMPLES);
  private filled = 0;

  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    let offset = 0;
    while (offset < channel.length) {
      const count = Math.min(channel.length - offset, BLOCK_SAMPLES - this.filled);
      this.block.set(channel.subarray(offset, offset + count), this.filled);
      this.filled += count;
      offset += count;
      if (this.filled === BLOCK_SAMPLES) {
        this.port.postMessage(this.block, [this.block.buffer]);
        this.block = new Float32Array(BLOCK_SAMPLES);
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor("kadr-mic-tap", MicTap);

export {};
