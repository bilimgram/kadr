export interface Beeper {
  /** Short tone for each countdown number. */
  tick(): void;
  /** Higher, longer tone when recording starts. */
  go(): void;
  dispose(): void;
}

/** Duration of the `go` tone, so callers can wait for it to finish before recording starts. */
export const GO_TONE_MS = 220;

/**
 * Countdown sounds synthesized with Web Audio, so no audio assets ship with the app.
 * Returns null where Web Audio is unavailable.
 */
export function createBeeper(volume = 0.16): Beeper | null {
  if (typeof AudioContext === "undefined") return null;
  const context = new AudioContext();

  const tone = (frequency: number, durationMs: number) => {
    if (context.state === "suspended") void context.resume();
    const start = context.currentTime;
    const end = start + durationMs / 1000;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(end + 0.05);
  };

  return {
    tick: () => tone(880, 120),
    go: () => tone(1320, GO_TONE_MS),
    dispose: () => void context.close(),
  };
}
