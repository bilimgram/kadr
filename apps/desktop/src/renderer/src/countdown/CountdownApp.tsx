import { Countdown } from "@kadr/ui";
import { useEffect, useRef, useState } from "react";
import type { CountdownConfig, CountdownResult } from "../../../shared/api";

/** Centered 3-2-1 overlay shown before recording starts (excluded from the recording). */
export function CountdownApp() {
  const [config, setConfig] = useState<CountdownConfig | null>(null);
  const finished = useRef(false);

  useEffect(() => {
    window.kadr.countdown
      .getConfig()
      .then(setConfig)
      .catch(() => void window.kadr.countdown.finish("cancelled"));
  }, []);

  const finish = (result: CountdownResult) => {
    if (finished.current) return;
    finished.current = true;
    void window.kadr.countdown.finish(result);
  };

  if (!config) return null;
  return (
    <main className="countdown-page">
      <Countdown
        seconds={config.seconds}
        sound={config.sound}
        onComplete={() => finish("completed")}
        onSkip={() => finish("skipped")}
        onCancel={() => finish("cancelled")}
      />
    </main>
  );
}
