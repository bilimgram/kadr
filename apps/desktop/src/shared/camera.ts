import type { CameraEffects } from "@kadr/compositor/background";
import type { DesktopBubbleSettings } from "./schemas";

/** The camera effects the bubble shows for these settings. */
export function bubbleCameraEffects(bubble: DesktopBubbleSettings): CameraEffects {
  const { mode, blur, presetId, imageRevision } = bubble.background;
  // "image" without a saved image shows the room until one is chosen.
  const effectiveMode = mode === "image" && imageRevision === null ? "none" : mode;
  return {
    touchUp: bubble.touchUp,
    mirror: bubble.mirror,
    background: { mode: effectiveMode, blur, presetId },
  };
}

/**
 * Effects for camera-only recordings, where the camera track itself is recorded (in the other modes
 * the bubble window is captured with the screen and already shows them). A video can't be
 * transparent, so a removed background becomes the chosen colour; the video isn't mirrored.
 */
export function recordingCameraEffects(bubble: DesktopBubbleSettings): CameraEffects {
  const effects = bubbleCameraEffects(bubble);
  const background =
    effects.background.mode === "remove"
      ? { ...effects.background, mode: "color" as const }
      : effects.background;
  return { ...effects, background, mirror: false };
}
