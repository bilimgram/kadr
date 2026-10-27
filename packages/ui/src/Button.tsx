import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./format";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  block?: boolean;
  /** Leading icon. */
  icon?: ReactNode;
  /** Trailing content, e.g. a keyboard shortcut. */
  trailing?: ReactNode;
}

export function Button({
  variant = "secondary",
  size = "md",
  block = false,
  icon,
  trailing,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        "k-button",
        `k-button--${variant}`,
        `k-button--${size}`,
        block && "k-button--block",
        className,
      )}
      {...rest}
    >
      {icon}
      <span className="k-button__label">{children}</span>
      {trailing && <span className="k-button__trailing">{trailing}</span>}
    </button>
  );
}
