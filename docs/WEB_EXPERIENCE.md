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

Advanced camera settings remain available during recording. Capture mode and microphone selection
are fixed when the recording starts. The preview supports pointer dragging and arrow-key camera
positioning. All recording states use the same mounted canvas.

## Verification performed

- Workspace lint, seven package typechecks, all 55 unit tests, and both production builds.
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
