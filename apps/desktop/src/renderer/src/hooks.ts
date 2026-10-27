import { useCallback, useEffect, useState } from "react";
import type {
  ActiveShortcuts,
  AppSettings,
  AppSettingsPatch,
  SessionSnapshot,
  UpdateState,
} from "../../shared/api";
import { elapsedMs, IDLE_SNAPSHOT } from "../../shared/session";

/** Persisted settings, kept in sync across windows. */
export function useSettings(): [AppSettings | null, (patch: AppSettingsPatch) => void] {
  const { settings, update } = useSettingsWithStatus();
  return [settings, update];
}

/**
 * Persisted settings plus load status, so the control panel can explain a failure instead of
 * staying blank. `retry` asks the main process again.
 */
export function useSettingsWithStatus(): {
  settings: AppSettings | null;
  update: (patch: AppSettingsPatch) => void;
  error: string | null;
  retry: () => void;
} {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    window.kadr.settings
      .get()
      .then((loaded) => {
        if (!active) return;
        setSettings(loaded);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      });
    const unsubscribe = window.kadr.settings.onChange(setSettings);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [attempt]);
  const update = useCallback((patch: AppSettingsPatch) => {
    window.kadr.settings
      .update(patch)
      .then(setSettings)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : String(reason)),
      );
  }, []);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { settings, update, error, retry };
}

/** Whether the bubble window is on screen, as reported by the main process. */
export function useBubbleVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let active = true;
    const unsubscribe = window.kadr.bubble.onVisibilityChange(setVisible);
    void window.kadr.bubble.isVisible().then((shown) => {
      if (active) setVisible(shown);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  return visible;
}

/** The current recording session, as published by the recording engine. */
export function useSession(): SessionSnapshot {
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(IDLE_SNAPSHOT);
  useEffect(() => {
    void window.kadr.session.get().then(setSnapshot);
    return window.kadr.session.onChange(setSnapshot);
  }, []);
  return snapshot;
}

/** Recorded time, re-rendering a few times per second while recording. */
export function useElapsed(snapshot: SessionSnapshot): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (snapshot.status !== "recording") return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [snapshot.status]);
  return elapsedMs(snapshot, now);
}

/** Global shortcuts that were actually registered (another app may own some candidates). */
export function useShortcuts(): ActiveShortcuts {
  const [shortcuts, setShortcuts] = useState<ActiveShortcuts>({
    startStop: null,
    pauseResume: null,
  });
  useEffect(() => {
    void window.kadr.shortcuts.get().then(setShortcuts);
  }, []);
  return shortcuts;
}

/** Auto-update state, pushed by the main process. */
export function useUpdates(): UpdateState | null {
  const [state, setState] = useState<UpdateState | null>(null);
  useEffect(() => {
    void window.kadr.updates.get().then(setState);
    return window.kadr.updates.onChange(setState);
  }, []);
  return state;
}
