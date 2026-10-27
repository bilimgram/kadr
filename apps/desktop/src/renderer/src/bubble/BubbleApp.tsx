import {
  CameraEnhancer,
  LightMeter,
  NEUTRAL_TONE,
  smoothTone,
  TARGET_FACE_LUMA,
  toneCssFilter,
  toneForLuma,
} from "@kadr/compositor";
import { getBubbleShape } from "@kadr/compositor/shapes";
import { ActivityIndicator, cx } from "@kadr/ui";
import { VideoOff } from "lucide-react";
import { type CSSProperties, type RefObject, useEffect, useRef, useState } from "react";
import { interactiveRegion, useWindowDrag } from "../floating";
import { useBubbleVisible, useSettings } from "../hooks";

const CLIP_ID = "kadr-bubble-clip";
/** Re-meter the face this often; tone changes ease in between. */
const METER_INTERVAL_MS = 250;

/**
 * Light correction for the live bubble (see packages/compositor/src/light.ts): renders each camera
 * frame through the GPU enhancer into a canvas on top of the video. The bubble is captured with the
 * screen, so recordings get the same correction. Falls back to a CSS filter without WebGL2.
 */
function useLightCorrection(
  videoRef: RefObject<HTMLVideoElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  enabled: boolean,
  mirror: boolean,
) {
  const [enhanced, setEnhanced] = useState(false);
  const [fallbackFilter, setFallbackFilter] = useState("none");
  const mirrorRef = useRef(mirror);
  mirrorRef.current = mirror;

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!enabled || !video) {
      setEnhanced(false);
      setFallbackFilter("none");
      return;
    }

    const enhancer = canvas ? CameraEnhancer.create(canvas) : null;
    const meter = new LightMeter();
    let tone = NEUTRAL_TONE;
    let target = NEUTRAL_TONE;
    let luma = TARGET_FACE_LUMA;
    let lastMeteredAt = -Infinity;
    let stopped = false;
    let handle = 0;
    setEnhanced(Boolean(enhancer));

    const draw = (now: number) => {
      if (stopped) return;
      if (now - lastMeteredAt >= METER_INTERVAL_MS) {
        lastMeteredAt = now;
        const metered = meter.measure(video);
        if (metered !== null) {
          luma = metered;
          target = toneForLuma(metered);
          if (!enhancer) setFallbackFilter(toneCssFilter(target, luma));
        }
      }
      tone = smoothTone(tone, target, 0.12);
      if (enhancer?.ready && canvas && video.videoWidth > 0) {
        const scale = window.devicePixelRatio || 1;
        const width = Math.max(1, Math.round(canvas.clientWidth * scale));
        const height = Math.max(1, Math.round(canvas.clientHeight * scale));
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        enhancer.render(
          video,
          { width: video.videoWidth, height: video.videoHeight },
          { ...tone, mirror: mirrorRef.current },
        );
      }
      schedule();
    };

    // One render per camera frame when supported; otherwise once per display frame.
    const schedule = () => {
      handle =
        "requestVideoFrameCallback" in video
          ? video.requestVideoFrameCallback((now) => draw(now))
          : requestAnimationFrame(draw);
    };
    schedule();

    return () => {
      stopped = true;
      if ("cancelVideoFrameCallback" in video) video.cancelVideoFrameCallback(handle);
      else cancelAnimationFrame(handle);
      enhancer?.dispose();
    };
  }, [videoRef, canvasRef, enabled]);

  return { enhanced, fallbackFilter };
}

/**
 * The floating camera bubble. Only the shape itself is interactive: clicks on the transparent
 * corners pass through to the apps underneath, and the bubble can be dragged anywhere.
 */
export function BubbleApp() {
  const [settings] = useSettings();
  const [error, setError] = useState<string | null>(null);
  // False until the first camera frame plays: until then the bubble shows a spinner.
  const [cameraReady, setCameraReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useWindowDrag();
  const touchUp = settings?.bubble.touchUp ?? false;
  const mirror = settings?.bubble.mirror ?? true;
  const { enhanced, fallbackFilter } = useLightCorrection(videoRef, canvasRef, touchUp, mirror);

  // Hold the camera only while the bubble is on screen: a hidden window would otherwise keep the
  // camera (and its privacy light) on after the panel closes.
  const visible = useBubbleVisible();
  const cameraDeviceId = settings?.bubble.cameraDeviceId;
  useEffect(() => {
    if (!visible) return;
    setCameraReady(false);
    let stream: MediaStream | null = null;
    let cancelled = false;
    const video: MediaTrackConstraints = {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    };
    if (cameraDeviceId) video.deviceId = { exact: cameraDeviceId };

    navigator.mediaDevices
      .getUserMedia({ video, audio: false })
      .then((s) => {
        if (cancelled) {
          for (const track of s.getTracks()) track.stop();
          return;
        }
        stream = s;
        setError(null);
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(() => setError("Camera unavailable"));

    return () => {
      cancelled = true;
      for (const track of stream?.getTracks() ?? []) track.stop();
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [cameraDeviceId, visible]);

  // Drawn right away (default shape until settings arrive), so the bubble never appears blank.
  const shape = getBubbleShape(settings?.bubble.shape ?? "circle");
  const spinnerSize = Math.max(22, Math.min(44, Math.round(window.innerHeight * 0.17)));
  const shapeStyle: CSSProperties =
    shape.kind === "path"
      ? { clipPath: `url(#${CLIP_ID})` }
      : ({ "--bubble-radius": shape.radius } as CSSProperties);

  return (
    <>
      <svg width="0" height="0" aria-hidden="true" focusable="false" className="k-sr-only">
        <defs>
          <clipPath id={CLIP_ID} clipPathUnits="objectBoundingBox">
            {shape.kind === "path" && <path d={shape.d} />}
          </clipPath>
        </defs>
      </svg>
      <div
        className={cx("bubble", shape.kind === "roundRect" && "bubble--round-rect")}
        style={shapeStyle}
        title="Drag to move"
        {...interactiveRegion}
        {...drag}
      >
        {error ? (
          <div className="bubble__error">
            <VideoOff className="k-icon" aria-hidden="true" />
            {error}
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              className={cx(
                "bubble__video bubble__media",
                cameraReady && "bubble__media--ready",
                !enhanced && mirror && "bubble__video--mirror",
              )}
              style={enhanced ? undefined : { filter: fallbackFilter }}
              onPlaying={() => setCameraReady(true)}
              onEmptied={() => setCameraReady(false)}
              autoPlay
              muted
              playsInline
            />
            {touchUp && (
              <canvas
                ref={canvasRef}
                className={cx(
                  "bubble__canvas bubble__media",
                  cameraReady && "bubble__media--ready",
                )}
                hidden={!enhanced}
              />
            )}
            {!cameraReady && (
              <div className="bubble__loading">
                <ActivityIndicator label="Starting camera" size={spinnerSize} />
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
