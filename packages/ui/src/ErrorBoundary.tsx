import { Component, type ErrorInfo, type ReactNode } from "react";
import { Alert } from "./Alert";
import { Button } from "./Button";

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Shown above the error message, e.g. "The control panel stopped working". */
  title?: string;
  /** Rendered instead of the default message; return null to render nothing (e.g. overlays). */
  fallback?: (error: Error, reload: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/** Catches render errors so a window shows a recoverable message instead of going blank. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Kadr UI error:", error, info.componentStack);
  }

  private readonly reload = () => window.location.reload();

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reload);
    return (
      <div className="k-error-boundary">
        <Alert
          tone="error"
          title={this.props.title ?? "Something went wrong"}
          actions={
            <Button size="sm" variant="primary" onClick={this.reload}>
              Reload
            </Button>
          }
        >
          {error.message}
        </Alert>
      </div>
    );
  }
}
