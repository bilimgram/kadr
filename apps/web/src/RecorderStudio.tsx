import {
  BUBBLE_SIZE_PRESETS,
  type BubbleSizePreset,
  DEFAULT_BUBBLE_LAYOUT,
  hitTestBubble,
  moveBubble,
} from "@kadr/compositor";
import type { BubbleLayout } from "@kadr/project-format";
import {
  Alert,
  Button,
  Countdown,
  cx,
  formatBytes,
  formatDuration,
  SegmentedControl,
  type SegmentedOption,
  ShapePicker,
  Switch,
} from "@kadr/ui";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronDown,
  CircleCheck,
  LoaderCircle,
  LockKeyhole,
  Mic,
  MicOff,
  Monitor,
  Pause,
  Play,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Video,
  VideoOff,
} from "lucide-react";
import { type PointerEvent, useEffect, useRef, useState } from "react";
import { DOWNLOADS } from "./links";
import { elapsedMs, type RecorderTiming, useCompositeRecorder } from "./useCompositeRecorder";

const icon = { className: "k-icon", "aria-hidden": true } as const;
const BUBBLE_MOVEMENT: Readonly<Record<string, { x: number; y: number }>> = {
  ArrowLeft: { x: -0.02, y: 0 },
  ArrowRight: { x: 0.02, y: 0 },
  ArrowUp: { x: 0, y: -0.02 },
  ArrowDown: { x: 0, y: 0.02 },
};
const SIZE_OPTIONS: ReadonlyArray<SegmentedOption<BubbleSizePreset>> = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];
const MODE_OPTIONS: ReadonlyArray<SegmentedOption<"camera" | "screen">> = [
  { value: "camera", label: "Screen + camera", icon: <Video {...icon} /> },
  { value: "screen", label: "Screen only", icon: <Monitor {...icon} /> },
];
const COUNTDOWN_OPTIONS: ReadonlyArray<SegmentedOption<"0" | "3" | "5">> = [
  { value: "0", label: "Off" },
  { value: "3", label: "3 sec" },
  { value: "5", label: "5 sec" },
];

function presetFor(size: number): BubbleSizePreset {
  return (
    (Object.entries(BUBBLE_SIZE_PRESETS).find(([, value]) => value === size)?.[0] as
      | BubbleSizePreset
      | undefined) ?? "medium"
  );
}

function RecordingTimer({ timing, active }: { timing: RecorderTiming; active: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [active]);
  return (
    <span className="recording-timer">
      {formatDuration(elapsedMs(timing, active ? now : Date.now()))}
    </span>
  );
}

function EmptyPreview({
  withCamera,
  withMicrophone,
}: {
  withCamera: boolean;
  withMicrophone: boolean;
}) {
  return (
    <div className="empty-preview">
      <div className="preview-art" aria-hidden="true">
        <div className="preview-art__window">
          <div className="preview-art__chrome">
            <i />
            <i />
            <i />
            <span />
          </div>
          <div className="preview-art__content">
            <div className="preview-art__sidebar">
              <i />
              <i />
              <i />
            </div>
            <div className="preview-art__body">
              <span className="preview-art__tag" />
              <span />
              <span />
              <div>
                <i />
                <i />
                <i />
              </div>
            </div>
          </div>
          <span className="preview-art__cursor">
            <ArrowRight />
          </span>
        </div>
        {withCamera && (
          <div className="preview-art__camera">
            <Video />
            <span>You, in the picture.</span>
          </div>
        )}
        <span className="preview-art__label">
          <span /> YOUR NEXT GREAT EXPLANATION
        </span>
      </div>
      <h3>Your screen goes here.</h3>
      <p>
        Start recording, then choose a tab, window,
        <br className="desktop-break" /> or your entire screen.
      </p>
      <div className="preview-devices">
        <span>
          {withCamera ? <Video {...icon} /> : <VideoOff {...icon} />} Camera{" "}
          {withCamera ? "on" : "off"}
        </span>
        <i />
        <span>
          {withMicrophone ? <Mic {...icon} /> : <MicOff {...icon} />} Microphone{" "}
          {withMicrophone ? "on" : "off"}
        </span>
      </div>
    </div>
  );
}

export function RecorderStudio() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);
  const [layout, setLayout] = useState<BubbleLayout>(DEFAULT_BUBBLE_LAYOUT);
  const [withCamera, setWithCamera] = useState(true);
  const [withMicrophone, setWithMicrophone] = useState(true);
  const [countdownSeconds, setCountdownSeconds] = useState<0 | 3 | 5>(3);
  const [countdownSound, setCountdownSound] = useState(true);
  const [downloadedUrl, setDownloadedUrl] = useState<string | null>(null);
  const recorder = useCompositeRecorder(canvasRef, layout, {
    withCamera,
    withMicrophone,
    countdownSeconds,
  });
  const { status, result } = recorder;
  const live = status === "countdown" || status === "recording" || status === "paused";
  const busy = live || status === "starting" || status === "saving";
  const configurable = status === "idle";
  const supported =
    typeof navigator.mediaDevices?.getDisplayMedia === "function" &&
    typeof MediaRecorder !== "undefined";
  const unsaved = result !== null && downloadedUrl !== result.url;
  const step = result && !busy ? 3 : busy ? 2 : 1;
  const SettingsContainer = result && !busy ? "details" : "div";

  useEffect(() => {
    if (!busy && !unsaved) return;
    const protectRecording = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", protectRecording);
    return () => window.removeEventListener("beforeunload", protectRecording);
  }, [busy, unsaved]);

  const toCanvasPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      point: {
        x: ((event.clientX - rect.left) / rect.width) * canvas.width,
        y: ((event.clientY - rect.top) / rect.height) * canvas.height,
      },
      frame: { width: canvas.width, height: canvas.height },
    };
  };

  return (
    <section id="studio" className="studio-section" aria-labelledby="studio-title" tabIndex={-1}>
      <div className="studio-heading">
        <div>
          <p className="eyebrow">YOUR BROWSER IS YOUR STUDIO</p>
          <h2 id="studio-title">{result && !busy ? "That’s a wrap." : "Ready when you are."}</h2>
        </div>
        <span className="local-badge">
          <ShieldCheck {...icon} /> Only on your device
        </span>
      </div>
      <div className="studio">
        <div className="studio__topbar">
          <div className="studio__title">
            <span className={cx("status-dot", live && "status-dot--recording")} />
            {status === "recording"
              ? "Recording in progress"
              : status === "paused"
                ? "Recording paused"
                : status === "saving"
                  ? "Finishing your video"
                  : result
                    ? "Your recording"
                    : "New recording"}
          </div>
          <ol className="studio-steps" aria-label="Recording progress">
            {["Set up", "Record", "Download"].map((label, index) => (
              <li
                key={label}
                aria-current={step === index + 1 ? "step" : undefined}
                className={cx(
                  step === index + 1 && "is-current",
                  step > index + 1 && "is-complete",
                )}
              >
                <span>{step > index + 1 ? <Check {...icon} /> : index + 1}</span>
                {label}
              </li>
            ))}
          </ol>
        </div>
        <div className="studio__body">
          <div className="stage-column">
            <section
              className={cx("stage", live && "stage--live", result && !busy && "stage--result")}
              aria-label="Recording preview"
            >
              <canvas
                ref={canvasRef}
                className="stage__canvas"
                hidden={!live && status !== "saving"}
                aria-label="Live preview. Drag the camera bubble or focus here and use arrow keys to reposition it."
                tabIndex={live && withCamera ? 0 : -1}
                onKeyDown={(event) => {
                  const movement = BUBBLE_MOVEMENT[event.key];
                  if (!movement || !live || !withCamera) return;
                  event.preventDefault();
                  const frame = {
                    width: event.currentTarget.width,
                    height: event.currentTarget.height,
                  };
                  setLayout((current) =>
                    moveBubble(
                      current,
                      {
                        x: (current.center.x + movement.x) * frame.width,
                        y: (current.center.y + movement.y) * frame.height,
                      },
                      frame,
                    ),
                  );
                }}
                onPointerDown={(event) => {
                  const { point, frame } = toCanvasPoint(event);
                  if (!hitTestBubble(layout, point, frame)) return;
                  dragging.current = true;
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  if (!dragging.current) return;
                  const { point, frame } = toCanvasPoint(event);
                  setLayout((current) => moveBubble(current, point, frame));
                }}
                onPointerUp={() => {
                  dragging.current = false;
                }}
                onPointerCancel={() => {
                  dragging.current = false;
                }}
              />
              {status === "countdown" && (
                <div className="stage__overlay">
                  <Countdown
                    seconds={countdownSeconds}
                    sound={countdownSound}
                    onComplete={recorder.begin}
                    onSkip={recorder.begin}
                    onCancel={recorder.cancel}
                  />
                </div>
              )}
              {!live &&
                status !== "saving" &&
                (result ? (
                  // biome-ignore lint/a11y/useMediaCaption: playback of the user's own recording; no transcript exists yet
                  <video
                    src={result.url}
                    controls
                    playsInline
                    className="stage__video"
                    aria-label="Play your recording"
                  />
                ) : (
                  <EmptyPreview withCamera={withCamera} withMicrophone={withMicrophone} />
                ))}
            </section>
            <div className="stage-caption">
              <span>
                <LockKeyhole {...icon} />{" "}
                {result && !busy
                  ? "Download your video before closing this page."
                  : live
                    ? "Your screen is being captured. You’re in control."
                    : "Nothing is recording until you press Start."}
              </span>
              <span className="format-hint">
                {result && !busy
                  ? `${formatDuration(result.durationMs)} · ${formatBytes(result.sizeBytes)}`
                  : "Local video · No uploads"}
              </span>
            </div>
          </div>
          <aside className="recorder-panel" aria-label="Recording settings and controls">
            {live || status === "saving" ? (
              <div className="live-controls">
                <div className="live-controls__status" role="status">
                  <span
                    className={cx(
                      "recording-indicator",
                      status === "paused" && "recording-indicator--paused",
                    )}
                  />
                  {status === "countdown"
                    ? "Get ready…"
                    : status === "paused"
                      ? "Take your time."
                      : status === "saving"
                        ? "Finishing up…"
                        : "You’re recording."}
                  <RecordingTimer timing={recorder.timing} active={status === "recording"} />
                </div>
                <div className="live-controls__buttons">
                  <Button
                    variant="danger"
                    block
                    disabled={status !== "recording" && status !== "paused"}
                    icon={
                      status === "saving" ? (
                        <LoaderCircle className="k-icon k-spin" aria-hidden="true" />
                      ) : (
                        <Square {...icon} />
                      )
                    }
                    onClick={() => void recorder.stop()}
                  >
                    Finish recording
                  </Button>
                  <Button
                    block
                    icon={status === "paused" ? <Play {...icon} /> : <Pause {...icon} />}
                    disabled={status !== "recording" && status !== "paused"}
                    onClick={status === "paused" ? recorder.resume : recorder.pause}
                  >
                    {status === "paused" ? "Resume" : "Pause"}
                  </Button>
                </div>
                <p>When you finish, your video will be ready to preview and download.</p>
              </div>
            ) : result ? (
              <div className="result-summary">
                <span className="result-summary__icon">
                  <CircleCheck {...icon} />
                </span>
                <p className="eyebrow">NICELY DONE</p>
                <h3>Your video is ready.</h3>
                <p>Watch it back, save it, then share the file wherever your team works.</p>
                <a
                  className="action-link action-link--primary download-link"
                  href={result.url}
                  download={result.fileName}
                  onClick={() => setDownloadedUrl(result.url)}
                >
                  <ArrowDownToLine {...icon} /> Download video
                </a>
                <span className="save-reminder">
                  {downloadedUrl === result.url
                    ? "Download requested. Check your Downloads folder."
                    : "No cloud copy — remember to save your file."}
                </span>
              </div>
            ) : (
              <div className="setup-heading">
                <h3>Let’s set the scene.</h3>
                <p>A few choices, then you’re rolling.</p>
              </div>
            )}
            <SettingsContainer className={result && !busy ? "next-recording-settings" : undefined}>
              {result && !busy && (
                <summary>
                  Settings for your next video <ChevronDown {...icon} />
                </summary>
              )}
              <div className="setup-fields">
                <div className="setting">
                  <p className="setting__label">What are you recording?</p>
                  <SegmentedControl
                    className="mode-control"
                    label="Recording mode"
                    value={withCamera ? "camera" : "screen"}
                    options={MODE_OPTIONS}
                    disabled={!configurable}
                    onChange={(value) => setWithCamera(value === "camera")}
                  />
                </div>
                <div className="microphone-setting">
                  <Switch
                    label="Microphone"
                    description="Give your video a voice"
                    checked={withMicrophone}
                    onChange={setWithMicrophone}
                    disabled={!configurable}
                  />
                </div>
                <details className="advanced-settings">
                  <summary>
                    <SlidersHorizontal {...icon} /> Customize your recording{" "}
                    <ChevronDown {...icon} />
                  </summary>
                  <div className="advanced-settings__body">
                    {withCamera && (
                      <>
                        <div className="setting">
                          <p className="setting__label">Camera shape</p>
                          <ShapePicker
                            value={layout.shape}
                            disabled={status === "starting" || status === "saving"}
                            onChange={(shape) => setLayout((current) => ({ ...current, shape }))}
                          />
                        </div>
                        <SegmentedControl
                          label="Camera bubble size"
                          value={presetFor(layout.size)}
                          options={SIZE_OPTIONS}
                          onChange={(preset) =>
                            setLayout((current) => ({
                              ...current,
                              size: BUBBLE_SIZE_PRESETS[preset],
                            }))
                          }
                        />
                        <Switch
                          label="Mirror camera"
                          checked={layout.mirror}
                          onChange={(mirror) => setLayout((current) => ({ ...current, mirror }))}
                        />
                      </>
                    )}
                    <div className="setting">
                      <p className="setting__label">Get-ready countdown</p>
                      <SegmentedControl
                        label="Countdown before recording"
                        value={`${countdownSeconds}`}
                        options={COUNTDOWN_OPTIONS}
                        disabled={!configurable}
                        onChange={(value) => setCountdownSeconds(Number(value) as 0 | 3 | 5)}
                      />
                    </div>
                    <Switch
                      label="Countdown sound"
                      checked={countdownSound}
                      disabled={!configurable || countdownSeconds === 0}
                      onChange={setCountdownSound}
                    />
                  </div>
                </details>
              </div>
            </SettingsContainer>
            {recorder.error && (
              <Alert tone="error" title="Let’s try that again">
                {recorder.error}
              </Alert>
            )}
            {recorder.warning && (
              <Alert tone="info" title="A quick heads-up">
                {recorder.warning}
              </Alert>
            )}
            {!supported && (
              <Alert tone="info" title="Use a desktop browser">
                For screen recording, open Kadr in Chrome or Edge on a computer. You can also{" "}
                <a href={DOWNLOADS}>get the desktop app</a>.
              </Alert>
            )}
            {configurable && (
              <div className="start-area">
                <Button
                  variant={result ? "secondary" : "primary"}
                  size="lg"
                  block
                  disabled={!supported}
                  icon={
                    result ? (
                      <Video {...icon} />
                    ) : (
                      <span className="record-dot" aria-hidden="true" />
                    )
                  }
                  trailing={<ArrowRight {...icon} />}
                  onClick={() => void recorder.prepare()}
                >
                  {result ? "Record another video" : "Start recording"}
                </Button>
                <p>
                  {result
                    ? "Save this video first. A new recording replaces this preview."
                    : "You’ll choose what to share next."}
                </p>
              </div>
            )}
            {status === "starting" && (
              <div className="waiting-state" role="status">
                <LoaderCircle className="k-icon k-spin" aria-hidden="true" />
                <strong>Choose a screen…</strong>
                <p>Use your browser’s sharing dialog to select a tab, window, or screen.</p>
              </div>
            )}
          </aside>
        </div>
      </div>
      <p className="browser-note">
        <Monitor {...icon} /> Best in Chrome or Edge on desktop. Recording stays in your browser
        until you download it.
      </p>
    </section>
  );
}
