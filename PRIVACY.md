# Privacy

Kadr is built to be private by default. This statement covers the Kadr desktop app and the web
recorder at [bilimgram.github.io/kadr](https://bilimgram.github.io/kadr/).

## The short version

- **No account, no telemetry, no analytics, no ads.** Kadr doesn't collect usage data or crash
  reports.
- **Your recordings stay on your device.** Kadr never uploads recordings, camera or microphone
  input, or anything on your screen.
- **The only network request the desktop app makes on its own is the update check.**

## What stays on your device

| Data                                  | Where                                                 |
| ------------------------------------- | ----------------------------------------------------- |
| Recordings                            | Your Videos folder (`Videos/Kadr`), as ordinary files |
| Settings (bubble, devices, shortcuts) | The app's settings file in your user profile          |
| Downloaded updates                    | The app's update cache, until they are installed      |
| Last recorded region, bubble position | `window-state.json` in your user profile              |

When a recording finishes, Kadr puts a reference to the file on your clipboard (not the video
itself), so you can paste it into another app. Turn this off in **Settings → More → Copy recordings
to clipboard**.

Camera, microphone and screen are accessed only while you use them: the camera while the bubble is
visible, and the screen, camera and microphone while you record. Light correction runs on your
computer's graphics processor; video frames never leave the app.

## Network connections

**Desktop app — update checks.** Shortly after launch and every few hours, Kadr downloads a small
file from `updates.bilimgram.uz` to see whether a new version exists, and downloads the update if
one does. Like any web request, this reveals your IP address and the app version and operating
system in the request headers to the hosting provider (Cloudflare). No identifier, account or
usage data is sent. You can turn automatic updates off in **Settings → More → Updates**, and
organizations can disable updates entirely with `KADR_DISABLE_UPDATES=1`.

**Web recorder.** The page is served by GitHub Pages, which, like any web host, processes your IP
address to deliver it (see [GitHub's privacy statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement)).
The page sets no cookies and loads no analytics or third-party scripts. Recording happens in your
browser's memory and is saved only when you download it.

**Desktop downloads on the website.** When you view the download section, the page requests public
release information from GitHub's API to display the latest version and the correct installer.
It does not include recordings, capture inputs, account information, or an app identifier in that
request. No GitHub credentials or cookies are sent by this lookup. Like any network request,
GitHub receives your IP address. Clicking a download retrieves the installer from GitHub's
release file hosting; it does not open the developer release page.

## Future features

Planned features that involve a network, such as AI editing or sharing, will be opt-in, will send
data only to the provider or storage **you** configure (your own AI key, a local model, or your own
bucket), and will be documented here before they ship.

## Contact

Questions about privacy: **hello@bilimgram.uz**. Security issues: see [SECURITY.md](SECURITY.md).
