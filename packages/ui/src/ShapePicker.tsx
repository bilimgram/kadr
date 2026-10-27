import { BUBBLE_SHAPE_IDS, BUBBLE_SHAPES } from "@kadr/compositor/shapes";
import type { BubbleShapeId } from "@kadr/project-format";
import { useId } from "react";
import { ShapeIcon } from "./ShapeIcon";

export interface ShapePickerProps {
  value: BubbleShapeId;
  onChange(shape: BubbleShapeId): void;
  disabled?: boolean;
}

/** Grid of bubble shapes, built on native radio inputs. */
export function ShapePicker({ value, onChange, disabled = false }: ShapePickerProps) {
  const name = useId();
  return (
    <fieldset className="k-shape-picker" disabled={disabled}>
      <legend className="k-sr-only">Bubble shape</legend>
      {BUBBLE_SHAPE_IDS.map((id) => (
        <label
          key={id}
          className="k-shape-picker__option"
          title={BUBBLE_SHAPES[id].label}
          data-shape={id}
        >
          <input
            type="radio"
            className="k-sr-only"
            name={name}
            value={id}
            checked={value === id}
            onChange={() => onChange(id)}
          />
          <ShapeIcon shape={BUBBLE_SHAPES[id]} />
          <span className="k-sr-only">{BUBBLE_SHAPES[id].label}</span>
        </label>
      ))}
    </fieldset>
  );
}
