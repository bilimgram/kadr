# Kadr user guide

Kadr records your screen with a live webcam bubble. Everything happens on your computer: there is
no account and nothing is uploaded. See also the [FAQ](#faq) and [privacy statement](../PRIVACY.md).

## Install

Download the file for your system from the
[latest release](https://bilimgram.github.io/kadr/#download), or skip installing and
[use Kadr in your browser](https://bilimgram.github.io/kadr/).

### Windows 10 and 11

1. Run `Kadr-Setup-<version>.exe`. It installs for your user only, so no administrator rights are
   needed.
2. Preview builds aren't code-signed yet, so Windows may show **"Windows protected your PC"**.
   Choose **More info → Run anyway**.

### macOS 12 or later

1. Download the `.dmg` for your Mac: `mac-arm64` for Apple Silicon (M1 and later), `mac-x64` for
   Intel. Open it and drag **Kadr** into **Applications**.
2. Preview builds aren't notarized by Apple yet. The first time you open Kadr, macOS says it
   "can't be opened". Open **System Settings → Privacy & Security**, scroll down, and choose
   **Open Anyway** next to the Kadr message. You only need to do this once.
3. Allow the permissions Kadr asks for (see [Permissions](#permissions)).

### Linux

- **AppImage** (any distribution, updates itself): make it executable and run it:
  `chmod +x Kadr-*.AppImage && ./Kadr-*.AppImage`.
- **Debian / Ubuntu**: `sudo apt install ./Kadr-*.deb`. Updates arrive with new `.deb` releases.


## Permissions

| Permission       | Why                   | Where to change it                                                            |
| ---------------- | --------------------- | ----------------------------------------------------------------------------- |
| Screen recording | To record your screen | macOS: System Settings → Privacy & Security → Screen & System Audio Recording |
| Camera           | For the webcam bubble | macOS: … → Camera · Windows: Settings → Privacy & security → Camera           |
| Microphone       | To record your voice  | macOS: … → Microphone · Windows: Settings → Privacy & security → Microphone   |

On macOS, quit and reopen Kadr after granting screen recording.

## Record in your browser

Open [Kadr’s recording studio](https://bilimgram.github.io/kadr/#studio) in a recent desktop
version of Chrome or Edge. Mobile screen capture is generally not supported.

1. Choose **Screen + camera** or **Screen only** and turn **Microphone** on or off.
2. Optionally open **Customize your recording** for camera shapes, size, mirroring, and countdown.
3. Press **Start recording**, then choose the tab, window, or screen in your browser’s sharing dialog.
   If the browser offers tab/system audio, select it there when you want to include it.
4. Allow the selected camera and microphone when prompted. Kadr shows a warning if either is unavailable.
5. After the countdown, use **Pause**, **Resume**, and **Finish recording**. Drag the camera bubble
   in the preview, or focus the preview and use the arrow keys to move it.
6. Watch your video and choose **Download video**. You can then share the file using your preferred app.

Browser videos stay in memory until downloaded. Save the file before leaving or refreshing the
page: Kadr does not keep a cloud copy. Before starting another video, download the current one;
expand **Settings for your next video** if you want different camera or microphone options.
Long recordings are limited by your device’s available memory.

## Your first desktop recording

1. Open Kadr. A small control panel appears in the top-right corner, and your camera bubble in the
   bottom-left. Closing the panel keeps Kadr running in the tray (menu bar on macOS).
2. Choose **Full screen** or **Camera only**, and pick your camera and microphone. The level meter shows
   that your microphone is working.
3. Press **Start recording**. After a 3-2-1 countdown, recording starts.
4. Use the floating toolbar on the left to **pause**, **restart**, **discard**, mute the microphone,
   hide the camera, or **stop**. The toolbar and countdown never appear in your recording.
5. When you stop, the recording is saved to your **Videos/Kadr** folder as MP4 (or WebM), and the
   panel offers **Open** and **Show in folder**.

Drag the bubble anywhere on screen; it is recorded wherever you put it.

## Settings

Open **Settings** in the control panel:

- **Bubble** — shape (circle, squircle, rounded square, hexagon, heart, blob, 16:9 card, 9:16
  portrait), size, **Light correction** (brightens a dim or backlit face automatically), and
  **Mirror camera**.
- **Countdown** — turn the countdown and its sound on or off.
- **Audio** — record system audio (sound playing on your computer). Windows only for now.
- **More** — appearance (light, dark or system), and [updates](#updates).

## Keyboard shortcuts

Shortcuts work from any app while Kadr is running:

| Action                 | Shortcut                                     |
| ---------------------- | -------------------------------------------- |
| Start / stop recording | <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> |
| Pause / resume         | <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> |

If another app already uses a shortcut, Kadr picks the next free one and shows it in the control
panel and toolbar tooltips.

## Updates

Kadr checks for updates shortly after it starts and every few hours, downloads them in the
background, and installs them the next time you quit. To install right away, choose **Restart to
update** in the control panel, in **Settings → More → Updates**, or in the tray menu. Kadr never
updates during a recording.

In **Settings → More → Updates** you can check manually, turn automatic updates off, or join the
**Beta** channel to get new features early.

Organizations can turn updates off by setting the environment variable `KADR_DISABLE_UPDATES=1`.

## FAQ

**Is Kadr free?** Yes. Kadr is open source under the Apache-2.0 license, with no watermark, time
limit, or account.

**Where are my recordings?** In your **Videos/Kadr** folder (`%USERPROFILE%\Videos\Kadr` on Windows,
`~/Movies/Kadr` on macOS, `~/Videos/Kadr` on Linux). Kadr never uploads them.

**Can I share a link instead of a file?** Not yet. Sharing to storage you control (S3, R2, MinIO)
is on the [roadmap](PLAN.md). For now, share the file like any other video.

**Why is my face too bright or too dark?** Light correction is on by default and adjusts to your
lighting. If you prefer your camera's own picture, turn off **Settings → Bubble → Light
correction**.

**Can I record system audio on macOS or Linux?** Not yet; it arrives with the native capture engine.
On Windows, turn it on in **Settings → Audio**.

**Can I choose a single window or a second monitor?** The desktop app currently records your main
display. The [browser version](https://bilimgram.github.io/kadr/) lets you pick any screen, window or
tab. Choosing in the desktop app is on the roadmap.

**What about AI editing?** It's planned: removing silences and filler words, captions, chapters and
titles, using your own AI key or a local model. Follow the [roadmap](PLAN.md).

**How do I uninstall?** Windows: **Settings → Apps → Kadr → Uninstall**. macOS: drag Kadr from
Applications to the Trash. Linux: delete the AppImage, or remove the Kadr package with your package
manager. Your recordings
stay in your Videos folder.

**Something doesn't work.** Please [open an issue](https://github.com/bilimgram/kadr/issues/new/choose)
with your Kadr version (**Settings → More**), operating system, and what happened. Questions and
ideas are welcome in [Discussions](https://github.com/bilimgram/kadr/discussions).
