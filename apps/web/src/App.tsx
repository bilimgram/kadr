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
import { Download, LoaderCircle, Monitor, Pause, Play, Square } from "lucide-react";
import { type PointerEvent, useEffect, useRef, useState } from "react";
import { elapsedMs, useCompositeRecorder } from "./useCompositeRecorder";

const icon = { className: "k-icon", "aria-hidden": true } as const;

const SIZE_OPTIONS: ReadonlyArray<SegmentedOption<BubbleSizePreset>> = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

const COUNTDOWN_OPTIONS: ReadonlyArray<SegmentedOption<"0" | "3" | "5">> = [
  { value: "0", label: "Off" },
  { value: "3", label: "3 sec" },
  { value: "5", label: "5 sec" },
];

function presetFor(size: number): BubbleSizePreset {
  const entry = Object.entries(BUBBLE_SIZE_PRESETS).find(([, value]) => value === size);
  return (entry?.[0] as BubbleSizePreset | undefined) ?? "medium";
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);
  const [layout, setLayout] = useState<BubbleLayout>(DEFAULT_BUBBLE_LAYOUT);
  const [withCamera, setWithCamera] = useState(true);
  const [countdownSeconds, setCountdownSeconds] = useState<0 | 3 | 5>(3);
  const [countdownSound, setCountdownSound] = useState(true);
  const recorder = useCompositeRecorder(canvasRef, layout, { withCamera, countdownSeconds });
  const { status } = recorder;
  const live = status === "countdown" || status === "recording" || status === "paused";
  const elapsed = elapsedMs(recorder.timing, useNow(status === "recording"));
  const configurable = status === "idle";

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
    <div className="app">
      <header className="app__header">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true" />
          <span>Kadr</span>
        </div>
        <p className="app__tagline">
          Screen recording with a live camera bubble. Everything stays in your browser.
        </p>
      </header>

      <main className="app__main">
        <section className="stage" aria-label="Recording preview">
          <canvas
            ref={canvasRef}
            className="stage__canvas"
            hidden={!live && status !== "saving"}
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

          {!live && status !== "saving" && (
            <div className="stage__empty">
              {recorder.result ? (
                // biome-ignore lint/a11y/useMediaCaption: the user's own recording; captions arrive with AI editing
                <video src={recorder.result.url} controls className="stage__video" />
              ) : (
                <div className="stage__placeholder">
                  <Monitor className="stage__placeholder-icon" aria-hidden="true" />
                  <p className="stage__placeholder-title">Ready when you are</p>
                  <p>
                    Press <strong>Start recording</strong> and pick a screen, window, or tab. You
                    can drag the bubble in the preview while recording.
                  </p>
                </div>
              )}
            </div>
          )}
        </section>

        <aside className="panel" aria-label="Recording settings">
          {live || status === "saving" ? (
            <div className="k-card">
              <div className={cx("rec-status", status === "paused" && "rec-status--paused")}>
                <span className="rec-status__dot" aria-hidden="true" />
                {status === "countdown"
                  ? "Get ready…"
                  : status === "paused"
                    ? "Paused"
                    : status === "saving"
                      ? "Saving…"
                      : "Recording"}
                <span className="rec-status__time">{formatDuration(elapsed)}</span>
              </div>
              <div className="panel__actions">
                <Button
                  variant="danger"
                  block
                  icon={
                    status === "saving" ? (
                      <LoaderCircle className="k-icon k-spin" aria-hidden="true" />
                    ) : (
                      <Square {...icon} />
                    )
                  }
                  disabled={status === "countdown" || status === "saving"}
                  onClick={() => void recorder.stop()}
                >
                  Stop
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
            </div>
          ) : null}

          <section className="k-card" aria-labelledby="bubble-title">
            <h2 id="bubble-title" className="k-card__title">
              Camera bubble
            </h2>
            <Switch
              label="Include camera"
              checked={withCamera}
              disabled={!configurable}
              onChange={setWithCamera}
            />
            <ShapePicker
              value={layout.shape}
              onChange={(shape) => setLayout((current) => ({ ...current, shape }))}
            />
            <SegmentedControl
              label="Bubble size"
              value={presetFor(layout.size)}
              options={SIZE_OPTIONS}
              onChange={(preset) =>
                setLayout((current) => ({ ...current, size: BUBBLE_SIZE_PRESETS[preset] }))
              }
            />
            <Switch
              label="Mirror camera"
              checked={layout.mirror}
              onChange={(mirror) => setLayout((current) => ({ ...current, mirror }))}
            />
          </section>

          <section className="k-card" aria-labelledby="countdown-title">
            <h2 id="countdown-title" className="k-card__title">
              Countdown
            </h2>
            <SegmentedControl
              label="Countdown before recording"
              value={`${countdownSeconds}`}
              options={COUNTDOWN_OPTIONS}
              disabled={!configurable}
              onChange={(value) => setCountdownSeconds(Number(value) as 0 | 3 | 5)}
            />
            <Switch
              label="Countdown sound"
              checked={countdownSound}
              disabled={!configurable || countdownSeconds === 0}
              onChange={setCountdownSound}
            />
          </section>

          {recorder.error && (
            <Alert tone="error" title="Couldn't record">
              {recorder.error}
            </Alert>
          )}
          {recorder.result && configurable && (
            <Alert
              tone="success"
              title="Recording ready"
              actions={
                <a
                  className="k-button k-button--secondary k-button--sm download-link"
                  href={recorder.result.url}
                  download={recorder.result.fileName}
                >
                  <Download {...icon} />
                  Download
                </a>
              }
            >
              {formatDuration(recorder.result.durationMs)} ·{" "}
              {formatBytes(recorder.result.sizeBytes)}
            </Alert>
          )}

          {configurable && (
            <Button
              variant="primary"
              size="lg"
              block
              icon={<span className="record-dot" aria-hidden="true" />}
              onClick={() => void recorder.prepare()}
            >
              Start recording
            </Button>
          )}
          {status === "starting" && (
            <Button
              variant="primary"
              size="lg"
              block
              disabled
              icon={<LoaderCircle className="k-icon k-spin" aria-hidden="true" />}
            >
              Waiting for screen…
            </Button>
          )}
        </aside>
      </main>
    </div>
  );
}
