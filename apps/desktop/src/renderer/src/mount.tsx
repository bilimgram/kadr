import "@kadr/ui/theme.css";
import "./styles.css";
import { ErrorBoundary } from "@kadr/ui";
import { type ReactNode, StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";

/** Reloads the window once after a crash: overlays are click-through, so a message can't be used. */
function ReloadAfterError({ reload }: { reload: () => void }) {
  useEffect(() => {
    const id = setTimeout(reload, 1000);
    return () => clearTimeout(id);
  }, [reload]);
  return null;
}

/**
 * Renders a window's root component behind an error boundary. `panel` windows show a recoverable
 * error message; `overlay` windows (bubble, toolbar, countdown) quietly reload instead.
 */
export function mount(app: ReactNode, kind: "panel" | "overlay"): void {
  const root = document.getElementById("root");
  if (!root) throw new Error("Missing #root");
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary
        title="Kadr ran into a problem"
        fallback={
          kind === "overlay" ? (_error, reload) => <ReloadAfterError reload={reload} /> : undefined
        }
      >
        {app}
      </ErrorBoundary>
    </StrictMode>,
  );
}
