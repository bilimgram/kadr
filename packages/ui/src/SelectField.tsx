import { ChevronDown } from "lucide-react";
import { type ReactNode, useId } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldProps {
  label: string;
  value: string;
  options: readonly SelectOption[];
  onChange(value: string): void;
  icon?: ReactNode;
  hint?: string;
  disabled?: boolean;
}

/** Labeled native select: keyboard, screen-reader and OS-picker behavior for free. */
export function SelectField({
  label,
  value,
  options,
  onChange,
  icon,
  hint,
  disabled = false,
}: SelectFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="k-field">
      <label htmlFor={id} className="k-field__label">
        {label}
      </label>
      <div className="k-select">
        {icon && <span className="k-select__icon">{icon}</span>}
        <select
          id={id}
          value={value}
          disabled={disabled}
          aria-describedby={hint ? hintId : undefined}
          onChange={(event) => onChange(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="k-icon k-select__chevron" aria-hidden="true" />
      </div>
      {hint && (
        <p id={hintId} className="k-field__hint">
          {hint}
        </p>
      )}
    </div>
  );
}
