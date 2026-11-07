import { type InputHTMLAttributes, useId } from "react";

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "onChange" | "value"> {
  label: string;
  value: string;
  onChange(value: string): void;
  hint?: string;
}

/** A labelled single-line text input; `hint` is linked as its description. */
export function TextField({ label, value, onChange, hint, ...input }: TextFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="k-field">
      <label htmlFor={id} className="k-field__label">
        {label}
      </label>
      <input
        {...input}
        id={id}
        className="k-input"
        value={value}
        aria-describedby={hint ? hintId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint && (
        <p id={hintId} className="k-field__hint">
          {hint}
        </p>
      )}
    </div>
  );
}
