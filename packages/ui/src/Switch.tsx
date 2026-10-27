export interface SwitchProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange(checked: boolean): void;
  disabled?: boolean;
}

/** On/off toggle: a native checkbox with the ARIA switch role. */
export function Switch({ label, description, checked, onChange, disabled = false }: SwitchProps) {
  return (
    <label className="k-switch">
      <span className="k-switch__text">
        {label}
        {description && <span className="k-switch__description">{description}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        aria-checked={checked}
        className="k-switch__input k-sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="k-switch__track" aria-hidden="true">
        <span className="k-switch__thumb" />
      </span>
    </label>
  );
}
