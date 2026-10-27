import { Button, cx, formatDuration, formatShortcut } from "@kadr/ui";
import {
  GripVertical,
  LoaderCircle,
  Mic,
  MicOff,
  Pause,
  Play,
  RotateCcw,
  Square,
  Trash,
  Video,
  VideoOff,
} from "lucide-react";
import { type ReactNode, useId, useRef, useState } from "react";
import type { SessionCommand } from "../../../shared/api";
import { interactiveRegion, useWindowDrag } from "../floating";
import { useElapsed, useSession, useSettings, useShortcuts } from "../hooks";

type Confirmation = "restart" | "discard";

const CONFIRM_COPY: Record<Confirmation, { title: string; action: string }> = {
  restart: { title: "Restart recording?", action: "Restart" },
  discard: { title: "Discard recording?", action: "Discard" },
};

const send = (command: SessionCommand) => void window.kadr.session.command(command);

function ToolbarButton({
  label,
  icon,
  onClick,
  disabled,
  pressed,
  tone,
}: {
  label: string;
  icon: ReactNode;
  onClick(): void;
  disabled?: boolean;
  pressed?: boolean;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      className={cx("toolbar__button", tone === "danger" && "toolbar__button--danger")}
      aria-label={label}
      aria-pressed={pressed}
      data-tooltip={label}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

/** Floating recording controls on the left edge of the screen (excluded from the recording). */
export function ToolbarApp() {
  const session = useSession();
  const [settings] = useSettings();
  const elapsed = useElapsed(session);
  const drag = useWindowDrag();
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const pausedForConfirmation = useRef(false);
  const titleId = useId();
  const shortcuts = useShortcuts();

  const platform = window.kadr.platform;
  const saving = session.status === "saving";
  const paused = session.status === "paused";
  const micMuted = session.microphone === "muted";
  const cameraOn = settings?.bubble.visible ?? true;
  const icon = { className: "k-icon", "aria-hidden": true } as const;
  const withShortcut = (label: string, accelerator: string | null) =>
    accelerator ? `${label} · ${formatShortcut(accelerator, platform)}` : label;

  const ask = (kind: Confirmation) => {
    if (session.status === "recording") {
      pausedForConfirmation.current = true;
      send("pause");
    }
    setConfirmation(kind);
  };

  const closeConfirmation = (confirmed: boolean) => {
    const kind = confirmation;
    setConfirmation(null);
    if (confirmed && kind) send(kind);
    else if (pausedForConfirmation.current) send("resume");
    pausedForConfirmation.current = false;
  };

  return (
    <div className="toolbar-layout">
      <div
        className="toolbar"
        role="toolbar"
        aria-label="Recording controls"
        aria-orientation="vertical"
        {...interactiveRegion}
      >
        <div className="toolbar__grip" title="Drag to move" {...drag}>
          <GripVertical {...icon} />
        </div>

        <button
          type="button"
          className="toolbar__stop"
          aria-label="Stop recording"
          data-tooltip={withShortcut("Stop and save", shortcuts.startStop)}
          disabled={saving}
          onClick={() => send("stop")}
        >
          {saving ? <LoaderCircle className="k-icon k-spin" aria-hidden /> : <Square {...icon} />}
        </button>

        <div className={cx("toolbar__time", paused && "toolbar__time--paused")}>
          <span className="toolbar__dot" aria-hidden="true" />
          <span className="k-sr-only">{paused ? "Paused at" : "Recording time"}</span>
          {formatDuration(elapsed)}
        </div>

        <div className="toolbar__divider" />

        <ToolbarButton
          label={withShortcut(paused ? "Resume" : "Pause", shortcuts.pauseResume)}
          icon={paused ? <Play {...icon} /> : <Pause {...icon} />}
          disabled={saving}
          onClick={() => send("togglePause")}
        />
        <ToolbarButton
          label="Restart"
          icon={<RotateCcw {...icon} />}
          disabled={saving}
          onClick={() => ask("restart")}
        />
        <ToolbarButton
          label="Discard"
          tone="danger"
          icon={<Trash {...icon} />}
          disabled={saving}
          onClick={() => ask("discard")}
        />

        <div className="toolbar__divider" />

        <ToolbarButton
          label={
            session.microphone === "unavailable"
              ? "No microphone"
              : micMuted
                ? "Unmute microphone"
                : "Mute microphone"
          }
          icon={micMuted ? <MicOff {...icon} /> : <Mic {...icon} />}
          pressed={micMuted}
          disabled={saving || session.microphone === "unavailable"}
          onClick={() => send("toggleMicrophone")}
        />
        <ToolbarButton
          label={cameraOn ? "Hide camera" : "Show camera"}
          icon={cameraOn ? <Video {...icon} /> : <VideoOff {...icon} />}
          pressed={!cameraOn}
          disabled={saving || session.mode !== "screenAndCamera"}
          onClick={() => send("toggleCamera")}
        />
      </div>

      {confirmation && (
        <div
          className="toolbar-confirm"
          role="alertdialog"
          aria-labelledby={titleId}
          {...interactiveRegion}
        >
          <p id={titleId} className="toolbar-confirm__title">
            {CONFIRM_COPY[confirmation].title}
          </p>
          <p className="toolbar-confirm__body">This take will be permanently deleted.</p>
          <div className="toolbar-confirm__actions">
            <Button variant="danger" size="sm" onClick={() => closeConfirmation(true)}>
              {CONFIRM_COPY[confirmation].action}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => closeConfirmation(false)}>
              Keep recording
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
