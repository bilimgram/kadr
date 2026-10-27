import { Button, formatBytes, SegmentedControl, type SegmentedOption } from "@kadr/ui";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronDown,
  Cpu,
  Download,
  Keyboard,
  Laptop,
  LoaderCircle,
  Monitor,
  MonitorPlay,
  RefreshCw,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  type DesktopPlatform,
  type DesktopRelease,
  type DownloadTarget,
  detectDesktopPlatform,
  fetchLatestRelease,
  releaseDownload,
} from "./releases";
import "./downloads.css";

const icon = { "aria-hidden": true } as const;
const PLATFORMS: ReadonlyArray<SegmentedOption<DesktopPlatform>> = [
  { value: "windows", label: "Windows", icon: <Monitor {...icon} /> },
  { value: "mac", label: "macOS", icon: <Laptop {...icon} /> },
  { value: "linux", label: "Linux", icon: <Terminal {...icon} /> },
];
const MAC_OPTIONS: ReadonlyArray<SegmentedOption<"arm64" | "x64">> = [
  { value: "arm64", label: "Apple silicon" },
  { value: "x64", label: "Intel" },
];
const LINUX_OPTIONS: ReadonlyArray<SegmentedOption<"appimage" | "deb">> = [
  { value: "appimage", label: "AppImage" },
  { value: "deb", label: "Debian / Ubuntu" },
];
const PLATFORM_NAMES = { windows: "Windows", mac: "macOS", linux: "Linux" } as const;
const INSTALL_STEPS = {
  windows: [
    "Download the installer.",
    "Open the .exe file from Downloads.",
    "Follow the setup steps, then open Kadr.",
  ],
  mac: [
    "Download the disk image.",
    "Open the .dmg and drag Kadr to Applications.",
    "Open Kadr and allow the capture permissions you need.",
  ],
  appimage: [
    "Download the AppImage.",
    "In your file manager, open the file’s Properties and allow it to run as a program.",
    "Open the AppImage to launch Kadr.",
  ],
  deb: [
    "Download the Debian / Ubuntu package.",
    "Open the .deb file with your software installer and choose Install.",
    "Open Kadr and allow the capture permissions you need.",
  ],
} as const;
type ReleaseState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; release: DesktopRelease };

export function DownloadsSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const lastChecked = useRef(0);
  const [active, setActive] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ReleaseState>({ status: "loading" });
  const [platform, setPlatform] = useState<DesktopPlatform>(
    () => detectDesktopPlatform(navigator.userAgent) ?? "windows",
  );
  const [macChip, setMacChip] = useState<"arm64" | "x64">("arm64");
  const [linuxFormat, setLinuxFormat] = useState<"appimage" | "deb">("appimage");
  const [requested, setRequested] = useState<string | null>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    if (typeof IntersectionObserver === "undefined") {
      setActive(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setActive(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px" },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
      setState({ status: "error", message: "The version check took too long. Please try again." });
    }, 15_000);
    setState({ status: "loading" });
    void fetchLatestRelease(controller.signal)
      .then((release) => {
        if (controller.signal.aborted) return;
        lastChecked.current = Date.now();
        setState({ status: "ready", release });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "We couldn’t check the latest version. Please try again.",
          });
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [active, attempt]);

  useEffect(() => {
    const refreshOnReturn = () => {
      if (
        active &&
        document.visibilityState === "visible" &&
        Date.now() - lastChecked.current > 60_000
      )
        setAttempt((value) => value + 1);
    };
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => document.removeEventListener("visibilitychange", refreshOnReturn);
  }, [active]);

  const target: DownloadTarget =
    platform === "mac"
      ? `mac-${macChip}`
      : platform === "linux"
        ? `linux-${linuxFormat}`
        : "windows-x64";
  const asset = state.status === "ready" ? releaseDownload(state.release, target) : undefined;
  const format =
    platform === "windows"
      ? "64-bit Intel / AMD · .exe installer"
      : platform === "mac"
        ? `${macChip === "arm64" ? "M-series Macs" : "Intel-based Macs"} · .dmg`
        : `64-bit Intel / AMD · ${linuxFormat === "appimage" ? ".AppImage" : ".deb"}`;
  const refresh = () => {
    setActive(true);
    setAttempt((value) => value + 1);
  };

  return (
    <section
      id="download"
      ref={sectionRef}
      className="download-section"
      aria-labelledby="download-title"
      tabIndex={-1}
    >
      <div className="download-intro">
        <p className="eyebrow">KADR FOR YOUR COMPUTER</p>
        <h2 id="download-title">
          Your studio.
          <br />
          <span>One click away.</span>
        </h2>
        <p>
          Keep your ideas flowing without keeping a browser tab open. Choose your computer and grab
          the latest Kadr.
        </p>
        <ul className="download-benefits">
          <li>
            <MonitorPlay {...icon} /> Floating recording controls
          </li>
          <li>
            <Keyboard {...icon} /> Shortcuts from any app
          </li>
          <li>
            <ShieldCheck {...icon} /> Your videos stay on your device
          </li>
        </ul>
        <a className="browser-alternative" href="#studio">
          Prefer your browser? Record here <ArrowRight {...icon} />
        </a>
      </div>
      <div className="download-card">
        <div className="download-card__heading">
          <span className="download-symbol">
            <Download {...icon} />
          </span>
          <div>
            <h3>Get Kadr</h3>
            <p>Free. Open source. Yours to keep.</p>
          </div>
        </div>
        <div className="download-platform">
          <span className="setting__label">Choose your computer</span>
          <SegmentedControl<DesktopPlatform>
            label="Download platform"
            value={platform}
            options={PLATFORMS}
            onChange={setPlatform}
          />
        </div>
        {platform === "mac" && (
          <div className="download-variant">
            <span className="setting__label">
              <Cpu {...icon} /> Which Mac do you have?
            </span>
            <SegmentedControl<"arm64" | "x64">
              label="Mac processor"
              value={macChip}
              options={MAC_OPTIONS}
              onChange={setMacChip}
            />
            <details className="chip-help">
              <summary>
                Not sure? <ChevronDown {...icon} />
              </summary>
              <p>
                Open the Apple menu → About This Mac. If it says <strong>Chip</strong> with an
                M-series name, choose Apple silicon. If it says <strong>Processor</strong> with
                Intel, choose Intel.
              </p>
            </details>
          </div>
        )}
        {platform === "linux" && (
          <div className="download-variant">
            <span className="setting__label">Choose a package</span>
            <SegmentedControl<"appimage" | "deb">
              label="Linux package"
              value={linuxFormat}
              options={LINUX_OPTIONS}
              onChange={setLinuxFormat}
            />
            <p className="package-help">
              {linuxFormat === "appimage"
                ? "A portable app for Linux distributions with AppImage support."
                : "An installable package for Debian, Ubuntu, and compatible distributions."}
            </p>
          </div>
        )}
        <div className="download-release" aria-live="polite" aria-atomic="true">
          {state.status === "loading" ? (
            <p className="download-loading">
              <LoaderCircle className="k-spin" {...icon} /> Checking the latest release…
            </p>
          ) : state.status === "error" ? (
            <div className="download-error">
              <p>{state.message}</p>
              <Button size="sm" onClick={refresh} icon={<RefreshCw {...icon} />}>
                Try again
              </Button>
            </div>
          ) : (
            <div className="release-meta">
              <span className="release-version">
                <span className="status-dot" /> Latest · v{state.release.version}
              </span>
              <span>
                Released{" "}
                {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
                  new Date(state.release.publishedAt),
                )}
              </span>
            </div>
          )}
          {asset ? (
            <>
              <a
                className="action-link action-link--primary platform-download"
                href={asset.url}
                onClick={() => setRequested(asset.url)}
              >
                <ArrowDownToLine {...icon} /> Download for {PLATFORM_NAMES[platform]}{" "}
                <ArrowRight {...icon} />
              </a>
              <p className="download-file">
                {format}
                <span> · {formatBytes(asset.size)}</span>
              </p>
            </>
          ) : state.status === "ready" ? (
            <div className="download-unavailable">
              <p>This release doesn’t have an installer for this selection yet.</p>
              <a href="#studio">
                Use Kadr in your browser <ArrowRight {...icon} />
              </a>
            </div>
          ) : (
            <Button
              className="platform-download"
              size="lg"
              block
              disabled
              icon={<ArrowDownToLine {...icon} />}
            >
              Download for {PLATFORM_NAMES[platform]}
            </Button>
          )}
        </div>
        {asset && requested === asset.url && (
          <p className="download-confirmation" role="status">
            <Check {...icon} /> Your download should start shortly. Look in your Downloads folder.
          </p>
        )}
        <div className="download-card__footer">
          <span>Early preview · No account needed</span>
          <Button
            variant="ghost"
            size="sm"
            disabled={state.status === "loading"}
            onClick={refresh}
            icon={<RefreshCw {...icon} />}
          >
            Check for updates
          </Button>
        </div>
        <details className="install-help">
          <summary>
            How to install on {PLATFORM_NAMES[platform]} <ChevronDown {...icon} />
          </summary>
          <ol>
            {INSTALL_STEPS[platform === "linux" ? linuxFormat : platform].map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p>
            {platform === "linux"
              ? "AppImage compatibility depends on your distribution; some systems also require FUSE support."
              : "Preview builds may show a system security prompt. Verify that your download came from Kadr before opening it."}
          </p>
        </details>
      </div>
    </section>
  );
}
