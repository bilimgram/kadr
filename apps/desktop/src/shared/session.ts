import type { SessionSnapshot, SessionStatus } from "./schemas";

export const IDLE_SNAPSHOT: SessionSnapshot = {
  status: "idle",
  mode: "screenAndCamera",
  accumulatedMs: 0,
  segmentStartedAt: null,
  microphone: "unavailable",
  lastResult: null,
  error: null,
};

/** Statuses during which a take exists and the floating toolbar is shown. */
export const ACTIVE_STATUSES: ReadonlySet<SessionStatus> = new Set([
  "recording",
  "paused",
  "saving",
]);

/** Recorded time so far, excluding pauses. */
export function elapsedMs(snapshot: SessionSnapshot, now: number = Date.now()): number {
  const running =
    snapshot.status === "recording" && snapshot.segmentStartedAt !== null
      ? Math.max(0, now - snapshot.segmentStartedAt)
      : 0;
  return snapshot.accumulatedMs + running;
}
