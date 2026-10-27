import { desktopCapturer, screen, session } from "electron";
import { isTrustedOrigin } from "../shared/origin";
import { pickScreenSource } from "../shared/region";

/**
 * Answers the recording engine's getDisplayMedia() in the main process, so no picker appears: the
 * display with the selected region when there is one, otherwise the primary display.
 */
export function handleDisplayCapture(
  devServerUrl: string | undefined,
  regionDisplayId: () => number | null,
): void {
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    if (!isTrustedOrigin(request.securityOrigin, devServerUrl)) return callback({});
    const sources = await desktopCapturer.getSources({ types: ["screen"] });
    const source = pickScreenSource(
      sources,
      regionDisplayId(),
      screen.getPrimaryDisplay().id,
      screen.getAllDisplays().length,
    );
    // No source rejects getDisplayMedia(), and the engine reports the failure.
    if (!source) return callback({});
    // System audio loopback is only supported on Windows; macOS needs the native core (Phase 4).
    const loopback = request.audioRequested && process.platform === "win32";
    callback(loopback ? { video: source, audio: "loopback" } : { video: source });
  });
}
