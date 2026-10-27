/** Turns media/permission failures into messages a user can act on. */
export function describeMediaError(error: unknown, platform: string): string {
  const name = error instanceof DOMException ? error.name : "";
  const settings =
    platform === "darwin"
      ? "System Settings → Privacy & Security"
      : "Windows Settings → Privacy & security";
  switch (name) {
    case "NotAllowedError":
      return `Permission was denied. Allow camera, microphone and screen recording for Kadr in ${settings}.`;
    case "NotFoundError":
      return "The selected camera or microphone was not found. Check that it is connected, or pick another device.";
    case "NotReadableError":
      return "The camera or microphone is being used by another app. Close that app and try again.";
    case "OverconstrainedError":
      return "The selected device doesn't support the requested settings. Pick another device.";
    default:
      return error instanceof Error ? error.message : String(error);
  }
}
