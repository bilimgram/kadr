# Web experience

The public site and browser recorder share the same page at https://bilimgram.github.io/kadr/.
The page introduces the product, links to the recording studio, and explains the local download
workflow. Marketing copy must distinguish available recording features from planned editing and
cloud sharing.

## Structure

- `WebsiteSections.tsx`: navigation, introduction, how-to, product principles, FAQ, desktop links.
- `RecorderStudio.tsx`: setup, recording progress, controls, playback, and download.
- `useCompositeRecorder.ts`: existing canvas compositor and recording lifecycle.
- `requestUserMedia.ts`: selected-device acquisition with microphone fallback after camera denial.
- `styles.css`: web-only light palette and responsive layout; desktop theme stays independent.
- `DownloadsSection.tsx` and `downloads.css`: user-facing platform selection and installation help.
- `releases.ts`: live public release lookup, validated installer URLs, and platform-specific matching.

Advanced camera settings remain available during recording. Capture mode and microphone selection
are fixed when the recording starts. The preview supports pointer dragging and arrow-key camera
positioning. All recording states use the same mounted canvas.

## Verification performed

- Workspace lint, seven package typechecks, all 64 unit tests, and both production builds.
- Five permission tests cover camera/microphone selection, camera-denied microphone fallback,
  repeated denial, and skipping device requests when both inputs are off.
- Synthetic browser recording: countdown, pause, resume, finish, playable 1280×720 video, local
  MP4 download, and next-recording controls.
- Browser checks for cancelled screen selection, preservation of the previous video after
  cancellation, denied-camera feedback, and microphone-off making no microphone request.
- Unsupported-browser guidance, FAQ expansion, keyboard skip navigation, and a 390 px layout
  without horizontal overflow.

Synthetic media was generated locally; no personal screen, camera, or microphone was captured.
Real-device permissions and encoding behavior can vary by browser and operating system.
The temporary test fixture is excluded from Git and deployment.

## Desktop downloads

The `#download` section checks GitHub's latest published full release when it approaches the
viewport. No version or asset URL is pinned in the website. Windows x64, Apple silicon and Intel
Macs, and Linux AppImage / DEB packages are matched against that release's actual files.
Future release versions work without a website rebuild. Missing files are shown as unavailable;
the page never silently chooses another processor, an older version, or a source archive.

The page rechecks after returning to the tab if the previous successful check is over a minute
old. Users can also choose **Check for updates**. Network failures and rate limits show a retry
state with no stale download button. A check times out after 15 seconds. Downloads are direct
installer file links hosted by GitHub; visitors do not need to navigate the developer release page.
The privacy statement documents the public metadata request.

Nine release tests cover platform matching, future versions, missing/wrong assets, URL validation,
malformed releases, OS suggestions, uncached anonymous requests, rate limiting, and network failure.
Browser verification covered all five live installer choices, retrying a simulated connection
failure into a newer version, missing-build handling, direct fragment navigation, and a 390 px
layout without horizontal overflow. Live installer URLs returned HTTP 200 with attachment headers;
the installer binaries were not executed as part of this website check.
