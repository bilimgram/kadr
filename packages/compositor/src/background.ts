/**
 * Camera background options: keep the room, blur it, remove it (transparent), or replace it with a
 * colour gradient or an image. Everything except "none" needs a person mask from the segmenter
 * (segmentation.ts); without one the camera is shown unchanged.
 */

export const CAMERA_BACKGROUND_MODES = ["none", "blur", "remove", "color", "image"] as const;

export type CameraBackgroundMode = (typeof CAMERA_BACKGROUND_MODES)[number];

export interface CameraBackground {
  mode: CameraBackgroundMode;
  /** Blur strength, 0 (subtle) … 1 (strong). */
  blur: number;
  /** Colour preset for "color" mode (see `BACKGROUND_PRESETS`). */
  presetId: string;
}

/** A vertical gradient, top to bottom. These are user-chosen scene colours, not UI colours. */
export interface BackgroundPreset {
  id: string;
  label: string;
  top: string;
  bottom: string;
}

export const BACKGROUND_PRESETS: readonly BackgroundPreset[] = [
  { id: "graphite", label: "Graphite", top: "#3d4350", bottom: "#1b1e24" },
  { id: "studio", label: "Studio", top: "#f4f6f8", bottom: "#c9d1da" },
  { id: "ocean", label: "Ocean", top: "#3b82c4", bottom: "#163a63" },
  { id: "forest", label: "Forest", top: "#5f9c6d", bottom: "#1f4a2c" },
  { id: "sunset", label: "Sunset", top: "#f2a65a", bottom: "#b4462f" },
  { id: "lavender", label: "Lavender", top: "#c9b6f2", bottom: "#5b3fa6" },
];

/** What the camera should look like. */
export interface CameraEffects {
  /** Automatic light correction (light.ts). */
  touchUp: boolean;
  background: CameraBackground;
  mirror: boolean;
}

export const DEFAULT_CAMERA_BACKGROUND: CameraBackground = {
  mode: "none",
  blur: 0.6,
  presetId: "graphite",
};

/** The preset with this id, or the first one for unknown ids (e.g. from a newer version). */
export function findBackgroundPreset(id: string): BackgroundPreset {
  return (
    BACKGROUND_PRESETS.find((preset) => preset.id === id) ??
    (BACKGROUND_PRESETS[0] as BackgroundPreset)
  );
}

export type Rgb = [number, number, number];

/** Parses `#rgb` or `#rrggbb` into 0..1 channels; anything else is black. */
export function hexToRgb(hex: string): Rgb {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) return [0, 0, 0];
  const digits =
    match[1].length === 3
      ? match[1]
          .split("")
          .map((digit) => digit + digit)
          .join("")
      : match[1];
  const value = Number.parseInt(digits, 16);
  return [((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255];
}

/** Whether a background needs the person mask to render. */
export function needsPersonMask(background: CameraBackground): boolean {
  return background.mode !== "none";
}
