import { BACKGROUND_PRESETS, type CameraBackgroundMode } from "@kadr/compositor/background";
import { Ban, Droplets, ImagePlus, Scissors } from "lucide-react";
import { type CSSProperties, type ReactNode, useId } from "react";
import { cx } from "./format";

/** What picking a tile changes. */
export type BackgroundChoice =
  | { mode: Exclude<CameraBackgroundMode, "color"> }
  | { mode: "color"; presetId: string };

export interface BackgroundPickerProps {
  mode: CameraBackgroundMode;
  presetId: string;
  /** Thumbnail of the saved custom image (an object URL), or null when there is none yet. */
  imageUrl: string | null;
  onChange(choice: BackgroundChoice): void;
  disabled?: boolean;
}

interface Tile {
  key: string;
  label: string;
  choice: BackgroundChoice;
  content: ReactNode;
  style?: CSSProperties;
  disabled?: boolean;
}

const icon = { className: "k-icon", "aria-hidden": true } as const;

/**
 * Grid of camera backgrounds: none, blur, remove, colour presets and a custom image, built on native
 * radio inputs (arrow keys move between tiles). The image tile is disabled until an image exists;
 * choosing one is a separate button, so moving with the keyboard never opens a file dialog.
 */
export function BackgroundPicker({
  mode,
  presetId,
  imageUrl,
  onChange,
  disabled = false,
}: BackgroundPickerProps) {
  const name = useId();
  const tiles: Tile[] = [
    { key: "none", label: "None", choice: { mode: "none" }, content: <Ban {...icon} /> },
    { key: "blur", label: "Blur", choice: { mode: "blur" }, content: <Droplets {...icon} /> },
    {
      key: "remove",
      label: "Remove",
      choice: { mode: "remove" },
      content: <Scissors {...icon} />,
    },
    ...BACKGROUND_PRESETS.map((preset) => ({
      key: `color:${preset.id}`,
      label: preset.label,
      choice: { mode: "color" as const, presetId: preset.id },
      content: null,
      // Scene colours chosen by the user, not UI colours.
      style: { background: `linear-gradient(${preset.top}, ${preset.bottom})` },
    })),
    {
      key: "image",
      label: imageUrl ? "Your image" : "Your image (choose one first)",
      choice: { mode: "image" },
      content: imageUrl ? null : <ImagePlus {...icon} />,
      style: imageUrl ? { backgroundImage: `url("${imageUrl}")` } : undefined,
      disabled: !imageUrl,
    },
  ];
  const selected = mode === "color" ? `color:${presetId}` : mode;

  return (
    <fieldset className="k-background-picker" disabled={disabled}>
      <legend className="k-sr-only">Background</legend>
      {tiles.map((tile) => (
        <label
          key={tile.key}
          className={cx(
            "k-background-picker__option",
            tile.style && "k-background-picker__option--swatch",
            tile.disabled && "k-background-picker__option--disabled",
          )}
          title={tile.label}
          style={tile.style}
        >
          <input
            type="radio"
            className="k-sr-only"
            name={name}
            value={tile.key}
            checked={selected === tile.key}
            disabled={tile.disabled}
            onChange={() => onChange(tile.choice)}
          />
          {tile.content}
          <span className="k-sr-only">{tile.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
