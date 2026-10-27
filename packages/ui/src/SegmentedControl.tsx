import { type ReactNode, useId } from "react";
import { cx } from "./format";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  /** Accessible name of the group. */
  label: string;
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange(value: T): void;
  disabled?: boolean;
  className?: string;
}

/**
 * Single-choice control built on native radio inputs, so arrow-key navigation and screen-reader
 * semantics come from the platform.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  className,
}: SegmentedControlProps<T>) {
  const name = useId();
  return (
    <fieldset className={cx("k-segmented", className)} disabled={disabled}>
      <legend className="k-sr-only">{label}</legend>
      {options.map((option) => (
        <label key={option.value} className="k-segmented__option">
          <input
            type="radio"
            className="k-sr-only"
            name={name}
            value={option.value}
            checked={option.value === value}
            disabled={option.disabled}
            onChange={() => onChange(option.value)}
          />
          {option.icon}
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
