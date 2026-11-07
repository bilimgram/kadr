import {
  type CameraEffects,
  CameraPipeline,
  LightMeter,
  needsSegmentation,
  toneCssFilter,
  toneForLuma,
} from "@kadr/compositor";
import { getBubbleShape } from "@kadr/compositor/shapes";
import { ActivityIndicator, cx } from "@kadr/ui";
import { VideoOff } from "lucide-react";
import { type CSSProperties, type RefObject, useEffect, useRef, useState } from "react";
import { bubbleCameraEffects } from "../../../shared/camera";
import { loadPersonSegmenter, useBackgroundImage } from "../camera/effects";
import { interactiveRegion, useWindowDrag } from "../floating";
import { useBubbleVisible, useSettings } from "../hooks";

const CLIP_ID = "kadr-bubble-clip";
/** Re-meter the face this often for the CSS fallback. */
const FALLBACK_METER_INTERVAL_MS = 250;

/**
 * Camera effects for the live bubble (light correction and backgrounds, see
 * packages/compositor/src/camera-pipeline.ts): renders each camera frame through the GPU pipeline
 * into a canvas on top of the video. The bubble is captured with the screen, so recordings look the
 * same. Without WebGL2, light correction falls back to a CSS filter and backgrounds are off.
 */
function useCameraEffects(
  videoRef: RefObject<HTMLVideoElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  effects: CameraEffects | null,
  backgroundImage: ImageBitmap | null,
) {
  const [processed, setProcessed] = useState(false);
  const [fallbackFilter, setFallbackFilter] = useState("none");
  const effectsRef = useRef(effects);
  effectsRef.current = effects;
  const imageRef = useRef(backgroundImage);
  imageRef.current = backgroundImage;
  const pipelineRef = useRef<CameraPipeline | null>(null);
  const active = effects !== null && needsSegmentation(effects);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!active || !video) {
      setProcessed(false);
      setFallbackFilter("none");
      return;
    }

    const pipeline = canvas ? CameraPipeline.create(canvas) : null;
    pipelineRef.current = pipeline;
    pipeline?.setBackgroundImage(imageRef.current);
    setProcessed(Boolean(pipeline));
    let stopped = false;
    let handle = 0;
    if (pipeline) {
      void loadPersonSegmenter().then((segmenter) => {
        if (!stopped) pipeline.setSegmenter(segmenter);
      });
    }
    const meter = pipeline ? null : new LightMeter();
    let lastMeteredAt = Number.NEGATIVE_INFINITY;

    const draw = (now: number) => {
      if (stopped) return;
      const current = effectsRef.current;
      if (pipeline?.ready && canvas && current && video.videoWidth > 0) {
        const scale = window.devicePixelRatio || 1;
        const width = Math.max(1, Math.round(canvas.clientWidth * scale));
        const height = Math.max(1, Math.round(canvas.clientHeight * scale));
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        pipeline.render(
          video,
          { width: video.videoWidth, height: video.videoHeight },
          current,
          now,
        );
      } else if (meter && current?.touchUp && now - lastMeteredAt >= FALLBACK_METER_INTERVAL_MS) {
        lastMeteredAt = now;
        const reading = meter.measure(video);
        if (reading) setFallbackFilter(toneCssFilter(toneForLuma(reading.luma), reading.luma));
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
      pipeline?.dispose();
      pipelineRef.current = null;
    };
  }, [videoRef, canvasRef, active]);

  useEffect(() => {
    pipelineRef.current?.setBackgroundImage(backgroundImage);
  }, [backgroundImage]);

  return { active, processed, fallbackFilter };
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
  const mirror = settings?.bubble.mirror ?? true;
  const effects = settings ? bubbleCameraEffects(settings.bubble) : null;
  const backgroundImage = useBackgroundImage(
    effects?.background.mode === "image"
      ? (settings?.bubble.background.imageRevision ?? null)
      : null,
  );
  const { active, processed, fallbackFilter } = useCameraEffects(
    videoRef,
    canvasRef,
    effects,
    backgroundImage,
  );
  // Background removed: only the person is drawn, the desktop shows around them.
  const cutOut = processed && effects?.background.mode === "remove";

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
  // About a quarter of the bubble: easy to see at every size.
  const spinnerSize = Math.max(32, Math.min(60, Math.round(window.innerHeight * 0.24)));
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
        className={cx(
          "bubble",
          shape.kind === "roundRect" && "bubble--round-rect",
          cutOut && "bubble--cut-out",
        )}
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
                !processed && mirror && "bubble__video--mirror",
                cutOut && "bubble__video--behind",
              )}
              style={processed ? undefined : { filter: fallbackFilter }}
              onPlaying={() => setCameraReady(true)}
              onEmptied={() => setCameraReady(false)}
              autoPlay
              muted
              playsInline
            />
            {active && (
              <canvas
                ref={canvasRef}
                className={cx(
                  "bubble__canvas bubble__media",
                  cameraReady && "bubble__media--ready",
                )}
                hidden={!processed}
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
