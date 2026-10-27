import type { CSSProperties } from "react";
import { cx } from "./format";

const SPOKES = 12;

export interface ActivityIndicatorProps {
  /** Announced to screen readers, e.g. "Starting camera". */
  label: string;
  /** Diameter in CSS pixels. */
  size?: number;
  className?: string;
}

/** An iOS-style spinner: twelve spokes fading in sequence. */
export function ActivityIndicator({ label, size = 28, className }: ActivityIndicatorProps) {
  return (
    <span
      className={cx("k-activity", className)}
      role="status"
      aria-label={label}
      style={{ "--k-activity-size": `${size}px` } as CSSProperties}
    >
      {Array.from({ length: SPOKES }, (_, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed set of identical spokes
          key={index}
          className="k-activity__spoke"
          style={{
            transform: `rotate(${(360 / SPOKES) * index}deg)`,
            animationDelay: `${(index - SPOKES) / SPOKES}s`,
          }}
        />
      ))}
    </span>
  );
}
