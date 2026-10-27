import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "./format";

export interface AlertProps {
  tone: "error" | "success" | "info";
  title: string;
  children?: ReactNode;
  /** Extra content under the body, e.g. action buttons. */
  actions?: ReactNode;
  onDismiss?(): void;
}

const ICONS = { error: CircleAlert, success: CircleCheck, info: Info } as const;

export function Alert({ tone, title, children, actions, onDismiss }: AlertProps) {
  const Icon = ICONS[tone];
  return (
    <div className={cx("k-alert", `k-alert--${tone}`)} role={tone === "error" ? "alert" : "status"}>
      <Icon className="k-icon k-alert__icon" aria-hidden="true" />
      <div className="k-alert__content">
        <p className="k-alert__title">{title}</p>
        {children && <div className="k-alert__body">{children}</div>}
        {actions}
      </div>
      {onDismiss && (
        <button type="button" className="k-alert__dismiss" aria-label="Dismiss" onClick={onDismiss}>
          <X className="k-icon" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
