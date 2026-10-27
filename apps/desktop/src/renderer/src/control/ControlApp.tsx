import {
  Alert,
  Button,
  cx,
  formatBytes,
  formatDuration,
  Kbd,
  SegmentedControl,
  type SegmentedOption,
  type SelectOption,
  ShapePicker,
  Switch,
} from "@kadr/ui";
import {
  ChevronDown,
  ChevronLeft,
  Ellipsis,
  FolderOpen,
  LoaderCircle,
  Mic,
  Monitor,
  Play,
  Power,
  RefreshCw,
  RotateCw,
  Smile,
  Timer,
  Video,
  Volume2,
  X,
} from "lucide-react";
import { type ReactNode, type Ref, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type {
  AppSettings,
  AppSettingsPatch,
  BubbleSizePreset,
  CountdownSeconds,
  ThemePreference,
  UpdateChannel,
  UpdateState,
} from "../../../shared/api";
import { updateStatusText } from "../../../shared/updates";
import { useSettings, useShortcuts, useUpdates } from "../hooks";
import { engine } from "./engine";
import { useFitWindowToContent, useMicLevelMeter, usePanelVisible } from "./panel-hooks";

type View = "main" | "bubble" | "countdown" | "audio" | "more";

const icon = { className: "k-icon", "aria-hidden": true } as const;

const SIZE_OPTIONS: ReadonlyArray<SegmentedOption<BubbleSizePreset>> = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

const COUNTDOWN_OPTIONS: ReadonlyArray<SegmentedOption<`${CountdownSeconds}`>> = [
  { value: "0", label: "Off" },
  { value: "3", label: "3 sec" },
  { value: "5", label: "5 sec" },
];

const THEME_OPTIONS: ReadonlyArray<SegmentedOption<ThemePreference>> = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const CHANNEL_OPTIONS: ReadonlyArray<SegmentedOption<UpdateChannel>> = [
  { value: "stable", label: "Stable" },
  { value: "beta", label: "Beta" },
];

const SOURCE_OPTIONS: readonly SelectOption[] = [
  { value: "screen", label: "Full screen" },
  { value: "camera", label: "Camera only" },
];

/** Pseudo-devices Chromium adds on Windows; we offer our own "Default" entry instead. */
const PSEUDO_DEVICE_IDS = new Set(["default", "communications"]);

function useDevices() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    const load = () => void navigator.mediaDevices.enumerateDevices().then(setDevices);
    load();
    navigator.mediaDevices.addEventListener("devicechange", load);
    return () => navigator.mediaDevices.removeEventListener("devicechange", load);
  }, []);
  const toOptions = (kind: MediaDeviceKind, fallback: string): SelectOption[] =>
    devices
      .filter((device) => device.kind === kind && !PSEUDO_DEVICE_IDS.has(device.deviceId))
      .map((device, index) => ({
        value: device.deviceId,
        label: device.label || `${fallback} ${index + 1}`,
      }));
  return {
    cameras: toOptions("videoinput", "Camera"),
    microphones: toOptions("audioinput", "Microphone"),
  };
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** A Loom-style source row: device picker with an On/Off pill and an optional level meter. */
function DeviceRow({
  icon: rowIcon,
  label,
  value,
  options,
  onChange,
  toggle,
  meterRef,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  options: readonly SelectOption[];
  onChange(value: string): void;
  toggle?: { on: boolean; label: string; disabled?: boolean; onToggle(): void };
  meterRef?: Ref<HTMLSpanElement>;
}) {
  const off = toggle && !toggle.on;
  return (
    <div className={cx("row", off && "row--off")}>
      <span className="row__icon">{rowIcon}</span>
      <select
        className="row__select"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="k-icon row__chevron" aria-hidden="true" />
      {toggle && (
        <button
          type="button"
          className={cx("row__toggle", toggle.on && "row__toggle--on")}
          aria-pressed={toggle.on}
          aria-label={toggle.label}
          disabled={toggle.disabled}
          onClick={toggle.onToggle}
        >
          {toggle.on ? "On" : "Off"}
        </button>
      )}
      {meterRef && !off && (
        <span className="row__meter" aria-hidden="true">
          <span ref={meterRef} className="row__meter-fill" />
        </span>
      )}
    </div>
  );
}

function NavButton({
  label,
  icon: navIcon,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  onClick(): void;
}) {
  return (
    <button type="button" className="nav-button" onClick={onClick}>
      {navIcon}
      <span>{label}</span>
    </button>
  );
}

function SubView({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack(): void;
  children: ReactNode;
}) {
  return (
    <section className="subview" aria-label={title}>
      <div className="subview__header">
        <button type="button" className="icon-button" aria-label="Back" onClick={onBack}>
          <ChevronLeft {...icon} />
        </button>
        <h2 className="subview__title">{title}</h2>
      </div>
      <div className="subview__body">{children}</div>
    </section>
  );
}

/** The control panel: a compact, Loom-style card that lives in the tray. */
export function ControlApp() {
  const [settings, update] = useSettings();
  const session = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const shortcuts = useShortcuts();
  const updates = useUpdates();
  const panelVisible = usePanelVisible();
  const panelRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>("main");
  useFitWindowToContent(panelRef);

  // Commands from the toolbar, tray and global shortcuts arrive here, where the engine lives.
  useEffect(() => window.kadr.session.onCommand((command) => void engine.dispatch(command)), []);

  const theme = settings?.appearance.theme;
  useEffect(() => {
    if (!theme) return;
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Re-open on the main view.
  useEffect(() => {
    if (!panelVisible) setView("main");
  }, [panelVisible]);

  return (
    <div ref={panelRef} className="panel">
      <header className="panel__header">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true" />
          <span>Kadr</span>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close (Kadr keeps running in the tray)"
          title="Close"
          onClick={() => window.kadr.panel.hide()}
        >
          <X {...icon} />
        </button>
      </header>
      {settings &&
        (view === "main" ? (
          <MainView
            settings={settings}
            update={update}
            session={session}
            updates={updates}
            startShortcut={shortcuts.startStop}
            micMeterActive={panelVisible && session.status === "idle"}
            onNavigate={setView}
          />
        ) : (
          <SettingsView
            view={view}
            settings={settings}
            update={update}
            shortcuts={shortcuts}
            updates={updates}
            recording={session.status !== "idle"}
            onBack={() => setView("main")}
          />
        ))}
    </div>
  );
}

function MainView({
  settings,
  update,
  session,
  updates,
  startShortcut,
  micMeterActive,
  onNavigate,
}: {
  settings: AppSettings;
  update(patch: AppSettingsPatch): void;
  session: ReturnType<typeof engine.getSnapshot>;
  updates: UpdateState | null;
  startShortcut: string | null;
  micMeterActive: boolean;
  onNavigate(view: View): void;
}) {
  const { cameras, microphones } = useDevices();
  const { bubble, recording } = settings;
  const platform = window.kadr.platform;
  const cameraOnly = recording.mode === "camera";
  const cameraOn = recording.mode !== "screen" && bubble.visible;
  const preparing = session.status === "preparing";
  const result = session.status === "idle" ? session.lastResult : null;
  const micMeter = useMicLevelMeter(
    recording.microphoneDeviceId,
    micMeterActive && recording.microphoneEnabled,
  );

  return (
    <div className="panel__body">
      {updates?.status === "downloaded" && session.status === "idle" && (
        <Alert
          tone="info"
          title={`Kadr ${updates.availableVersion} is ready`}
          actions={
            <div className="result-actions">
              <Button
                size="sm"
                variant="primary"
                icon={<RotateCw {...icon} />}
                onClick={() => void window.kadr.updates.install()}
              >
                Restart to update
              </Button>
            </div>
          }
        >
          {updates.message ?? "It installs automatically the next time you quit Kadr."}
        </Alert>
      )}
      {session.error && (
        <Alert tone="error" title="Recording failed" onDismiss={() => engine.dismissResult()}>
          {session.error}
        </Alert>
      )}
      {result && (
        <Alert
          tone="success"
          title="Recording saved"
          onDismiss={() => engine.dismissResult()}
          actions={
            <div className="result-actions">
              <Button
                size="sm"
                icon={<Play {...icon} />}
                onClick={() => void window.kadr.shell.openPath(result.path)}
              >
                Open
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<FolderOpen {...icon} />}
                onClick={() => void window.kadr.shell.showInFolder(result.path)}
              >
                Show in folder
              </Button>
            </div>
          }
        >
          <span className="result-name">{fileName(result.path)}</span>
          <span>
            {formatDuration(result.durationMs)} · {formatBytes(result.sizeBytes)}
          </span>
        </Alert>
      )}

      <div className="rows">
        <DeviceRow
          icon={cameraOnly ? <Video {...icon} /> : <Monitor {...icon} />}
          label="Recording source"
          value={cameraOnly ? "camera" : "screen"}
          options={SOURCE_OPTIONS}
          onChange={(value) =>
            update({
              recording: { mode: value === "camera" ? "camera" : "screenAndCamera" },
              bubble: { visible: true },
            })
          }
        />
        <DeviceRow
          icon={<Video {...icon} />}
          label="Camera"
          value={bubble.cameraDeviceId ?? ""}
          options={[{ value: "", label: "Default camera" }, ...cameras]}
          onChange={(value) => update({ bubble: { cameraDeviceId: value || undefined } })}
          toggle={{
            on: cameraOn,
            label: cameraOn ? "Turn camera off" : "Turn camera on",
            disabled: cameraOnly,
            onToggle: () =>
              update(
                cameraOn
                  ? { recording: { mode: "screen" } }
                  : { recording: { mode: "screenAndCamera" }, bubble: { visible: true } },
              ),
          }}
        />
        <DeviceRow
          icon={<Mic {...icon} />}
          label="Microphone"
          value={recording.microphoneDeviceId ?? "default"}
          options={[{ value: "default", label: "Default microphone" }, ...microphones]}
          onChange={(value) =>
            update({
              recording: { microphoneDeviceId: value === "default" ? undefined : value },
            })
          }
          toggle={{
            on: recording.microphoneEnabled,
            label: recording.microphoneEnabled ? "Turn microphone off" : "Turn microphone on",
            onToggle: () =>
              update({ recording: { microphoneEnabled: !recording.microphoneEnabled } }),
          }}
          meterRef={micMeter}
        />
      </div>

      <Button
        variant="primary"
        size="lg"
        block
        className="start-button"
        disabled={session.status !== "idle"}
        icon={
          preparing ? (
            <LoaderCircle className="k-icon k-spin" aria-hidden="true" />
          ) : (
            <span className="record-dot" aria-hidden="true" />
          )
        }
        onClick={() => void engine.dispatch("start")}
      >
        {preparing ? "Starting…" : "Start recording"}
      </Button>
      <p className="panel__hint">
        No recording limit
        {startShortcut && (
          <>
            {" · "}
            <Kbd shortcut={startShortcut} platform={platform} /> to start or stop
          </>
        )}
      </p>

      <nav className="panel__nav" aria-label="Settings">
        <NavButton label="Bubble" icon={<Smile {...icon} />} onClick={() => onNavigate("bubble")} />
        <NavButton
          label="Countdown"
          icon={<Timer {...icon} />}
          onClick={() => onNavigate("countdown")}
        />
        <NavButton label="Audio" icon={<Volume2 {...icon} />} onClick={() => onNavigate("audio")} />
        <NavButton label="More" icon={<Ellipsis {...icon} />} onClick={() => onNavigate("more")} />
      </nav>
    </div>
  );
}

function SettingsView({
  view,
  settings,
  update,
  shortcuts,
  updates,
  recording: isRecording,
  onBack,
}: {
  view: Exclude<View, "main">;
  settings: AppSettings;
  update(patch: AppSettingsPatch): void;
  shortcuts: ReturnType<typeof useShortcuts>;
  updates: UpdateState | null;
  recording: boolean;
  onBack(): void;
}) {
  const { bubble, recording, appearance } = settings;
  const platform = window.kadr.platform;

  switch (view) {
    case "bubble":
      return (
        <SubView title="Camera bubble" onBack={onBack}>
          <ShapePicker value={bubble.shape} onChange={(shape) => update({ bubble: { shape } })} />
          <SegmentedControl
            label="Bubble size"
            value={bubble.size}
            options={SIZE_OPTIONS}
            onChange={(size) => update({ bubble: { size } })}
          />
          <Switch
            label="Light correction"
            description="Brightens your camera in dim rooms"
            checked={bubble.touchUp}
            onChange={(touchUp) => update({ bubble: { touchUp } })}
          />
          <Switch
            label="Mirror camera"
            description="Show yourself like in a mirror"
            checked={bubble.mirror}
            onChange={(mirror) => update({ bubble: { mirror } })}
          />
        </SubView>
      );
    case "countdown":
      return (
        <SubView title="Countdown" onBack={onBack}>
          <SegmentedControl
            label="Countdown before recording"
            value={`${recording.countdownSeconds}`}
            options={COUNTDOWN_OPTIONS}
            onChange={(value) =>
              update({ recording: { countdownSeconds: Number(value) as CountdownSeconds } })
            }
          />
          <Switch
            label="Countdown sound"
            description="A short beep on every second"
            checked={recording.countdownSound}
            disabled={recording.countdownSeconds === 0}
            onChange={(countdownSound) => update({ recording: { countdownSound } })}
          />
        </SubView>
      );
    case "audio":
      return (
        <SubView title="Audio" onBack={onBack}>
          {platform === "win32" ? (
            <Switch
              label="System audio"
              description="Include sound playing on your computer"
              checked={recording.systemAudio}
              disabled={recording.mode === "camera"}
              onChange={(systemAudio) => update({ recording: { systemAudio } })}
            />
          ) : (
            <p className="subview__note">
              System audio recording on this platform arrives with the native capture engine.
            </p>
          )}
          <p className="subview__note">
            Your microphone is recorded with echo cancellation and noise suppression.
          </p>
        </SubView>
      );
    case "more":
      return (
        <SubView title="More" onBack={onBack}>
          <div className="k-field">
            <span className="k-field__label">Appearance</span>
            <SegmentedControl
              label="Appearance"
              value={appearance.theme}
              options={THEME_OPTIONS}
              onChange={(theme) => update({ appearance: { theme } })}
            />
          </div>
          {updates && (
            <UpdatesSection
              state={updates}
              settings={settings.updates}
              busy={isRecording}
              onChange={(patch) => update({ updates: patch })}
            />
          )}
          <dl className="shortcut-list">
            <dt>Start / stop recording</dt>
            <dd>
              {shortcuts.startStop ? (
                <Kbd shortcut={shortcuts.startStop} platform={platform} />
              ) : (
                "Unavailable"
              )}
            </dd>
            <dt>Pause / resume</dt>
            <dd>
              {shortcuts.pauseResume ? (
                <Kbd shortcut={shortcuts.pauseResume} platform={platform} />
              ) : (
                "Unavailable"
              )}
            </dd>
          </dl>
          <div className="subview__actions">
            <Button
              icon={<FolderOpen {...icon} />}
              onClick={() => void window.kadr.shell.openRecordingsFolder()}
            >
              Open recordings folder
            </Button>
            <Button
              variant="ghost"
              icon={<Power {...icon} />}
              onClick={() => window.kadr.app.quit()}
            >
              Quit Kadr
            </Button>
          </div>
        </SubView>
      );
  }
}

function UpdatesSection({
  state,
  settings,
  busy,
  onChange,
}: {
  state: UpdateState;
  settings: AppSettings["updates"];
  busy: boolean;
  onChange(patch: Partial<AppSettings["updates"]>): void;
}) {
  const disabled = state.status === "disabled";
  const working =
    state.status === "checking" || state.status === "available" || state.status === "downloading";
  return (
    <section className="updates" aria-labelledby="updates-title">
      <div className="updates__header">
        <span id="updates-title" className="k-field__label">
          Updates
        </span>
        <span className="updates__version">Version {state.currentVersion}</span>
      </div>
      <p className={cx("updates__status", state.status === "error" && "updates__status--error")}>
        {updateStatusText(state)}
      </p>
      {state.status === "downloading" && (
        <div className="updates__progress" aria-hidden="true">
          <span style={{ transform: `scaleX(${(state.progress ?? 0) / 100})` }} />
        </div>
      )}
      {state.status === "downloaded" ? (
        <Button
          variant="primary"
          icon={<RotateCw {...icon} />}
          disabled={busy}
          onClick={() => void window.kadr.updates.install()}
        >
          Restart to update
        </Button>
      ) : (
        <Button
          icon={<RefreshCw className={cx("k-icon", working && "k-spin")} aria-hidden="true" />}
          disabled={disabled || working || busy}
          onClick={() => void window.kadr.updates.check()}
        >
          Check for updates
        </Button>
      )}
      {!disabled && (
        <>
          <SegmentedControl
            label="Update channel"
            value={settings.channel}
            options={CHANNEL_OPTIONS}
            onChange={(channel) => onChange({ channel })}
          />
          <p className="updates__hint">
            {settings.channel === "beta"
              ? "Beta gets new features early and may be less stable."
              : "Leaving Beta takes effect with the next newer stable release."}
          </p>
          <Switch
            label="Automatic updates"
            description="Download new versions in the background"
            checked={settings.automatic}
            onChange={(automatic) => onChange({ automatic })}
          />
        </>
      )}
    </section>
  );
}
