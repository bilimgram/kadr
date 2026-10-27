import { type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode, useState } from "react";
import { cx } from "./format";

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> {
  /** Accessible name, also shown as the tooltip. */
  label: string;
  icon: ReactNode;
  /** Where the tooltip appears; `top-end` keeps it inside a container's right edge. */
  tooltip?: "top" | "top-end" | "bottom" | "right";
  size?: "sm" | "md";
}

/**
 * A square icon-only button with a tooltip on hover and keyboard focus. Escape hides the tooltip
 * without moving focus (WCAG 1.4.13), and the event stops there so it doesn't also close a dialog.
 */
export function IconButton({
  label,
  icon,
  tooltip = "top",
  size = "md",
  className,
  type = "button",
  onKeyDown,
  onBlur,
  onMouseLeave,
  ...rest
}: IconButtonProps) {
  const [tooltipHidden, setTooltipHidden] = useState(false);
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    onKeyDown?.(event);
    if (event.key === "Escape" && !tooltipHidden && !event.defaultPrevented) {
      event.preventDefault();
      setTooltipHidden(true);
    }
  };
  return (
    <button
      type={type}
      className={cx("k-icon-button", `k-icon-button--${size}`, className)}
      aria-label={label}
      data-tooltip={label}
      data-tooltip-placement={tooltip}
      data-tooltip-hidden={tooltipHidden || undefined}
      onKeyDown={handleKeyDown}
      onBlur={(event) => {
        setTooltipHidden(false);
        onBlur?.(event);
      }}
      onMouseLeave={(event) => {
        setTooltipHidden(false);
        onMouseLeave?.(event);
      }}
      {...rest}
    >
      {icon}
    </button>
  );
}
