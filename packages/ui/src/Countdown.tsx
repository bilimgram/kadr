import { type CSSProperties, useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { createBeeper, GO_TONE_MS } from "./sounds";

export interface CountdownProps {
  seconds: number;
  sound: boolean;
  /** Called once when the countdown reaches zero (after the start tone has played). */
  onComplete(): void;
  /** Start immediately (Enter). */
  onSkip?(): void;
  /** Abort (Escape). */
  onCancel?(): void;
}

const RADIUS = 104;
const RING_LENGTH = 2 * Math.PI * RADIUS;

/**
 * 3-2-1 countdown with a sweeping ring and optional tones. Keyboard: Enter starts now, Escape
 * cancels. The start tone finishes before `onComplete` fires so it is not captured in the recording.
 */
export function Countdown({ seconds, sound, onComplete, onSkip, onCancel }: CountdownProps) {
  const [remaining, setRemaining] = useState(seconds);
  const callbacks = useRef({ onComplete, onSkip, onCancel });
  callbacks.current = { onComplete, onSkip, onCancel };

  useEffect(() => {
    const beeper = sound ? createBeeper() : null;
    let current = seconds;
    let completeTimer: ReturnType<typeof setTimeout> | undefined;
    setRemaining(current);
    beeper?.tick();

    const interval = setInterval(() => {
      current -= 1;
      if (current > 0) {
        setRemaining(current);
        beeper?.tick();
        return;
      }
      clearInterval(interval);
      beeper?.go();
      completeTimer = setTimeout(
        () => callbacks.current.onComplete(),
        beeper ? GO_TONE_MS + 80 : 0,
      );
    }, 1000);

    return () => {
      clearInterval(interval);
      clearTimeout(completeTimer);
      beeper?.dispose();
    };
  }, [seconds, sound]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") callbacks.current.onCancel?.();
      if (event.key === "Enter") callbacks.current.onSkip?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="k-countdown" role="timer" aria-live="assertive">
      <div className="k-countdown__dial">
        <svg className="k-countdown__ring" viewBox="0 0 220 220" aria-hidden="true">
          <circle className="k-countdown__ring-track" cx="110" cy="110" r={RADIUS} />
          <circle
            key={remaining}
            className="k-countdown__ring-progress"
            cx="110"
            cy="110"
            r={RADIUS}
            strokeDasharray={RING_LENGTH}
            style={{ "--k-ring-length": `${RING_LENGTH}` } as CSSProperties}
          />
        </svg>
        <span key={`n${remaining}`} className="k-countdown__number">
          {remaining}
        </span>
        <span className="k-countdown__label">Recording starts in</span>
      </div>
      {(onSkip || onCancel) && (
        <div className="k-countdown__actions">
          {onSkip && (
            <Button variant="primary" size="sm" onClick={onSkip}>
              Start now
            </Button>
          )}
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
