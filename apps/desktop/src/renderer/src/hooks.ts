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
  const [settings, setSettings] = useState<AppSettings | null>(null);
  useEffect(() => {
    void window.kadr.settings.get().then(setSettings);
    return window.kadr.settings.onChange(setSettings);
  }, []);
  const update = useCallback((patch: AppSettingsPatch) => {
    void window.kadr.settings.update(patch).then(setSettings);
  }, []);
  return [settings, update];
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
