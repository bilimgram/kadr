# @kadr/desktop

## 0.1.1

### Patch Changes

- Fixes for the first preview, and a more polished bubble and control panel.
  
  - Fixed: in installed builds the control panel showed only its header, the close button did nothing,
    and the camera couldn't start. Every request from the app's windows was wrongly rejected as
    untrusted.
  - Fixed: closing the panel now hides the camera bubble and turns the camera (and its light) off.
  - The bubble appears instantly with a loading indicator and fades the camera in when it's ready.
  - New in **Settings → More**: **Open Kadr at login** (Windows and macOS), and **Help and feedback**
    with the user guide, a prefilled problem report, privacy and source links.
  - Press <kbd>Esc</kbd> to go back from a settings page or close the panel.
  - If a window ever fails, Kadr shows what went wrong or recovers by itself instead of going blank,
    and a second launch brings the running Kadr forward.

## 0.1.0

### Minor Changes

- First public preview of Kadr for Windows, macOS and Linux.
  - Record your screen, camera and microphone (system audio on Windows), or just your camera.
  - Live webcam bubble in eight shapes and three sizes; drag it anywhere, mirror it, hide it.
  - Automatic light correction that brightens underexposed faces without blowing out highlights.
  - 3-2-1 countdown with sound, and a floating toolbar to stop, pause, restart or discard; the
    toolbar and countdown never appear in the recording.
  - Global shortcuts, tray icon, light and dark appearance.
  - Recordings are saved as MP4 or WebM in your Videos folder; nothing is uploaded.
  - Automatic background updates with stable and beta channels, never during a recording.
