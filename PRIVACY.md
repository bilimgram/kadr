# Privacy

Kadr is built to be private by default. This statement covers the Kadr desktop app and the web
recorder at [bilimgram.github.io/kadr](https://bilimgram.github.io/kadr/).

## The short version

- **No account, no telemetry, no analytics, no ads.** Kadr doesn't collect usage data or crash
  reports.
- **Your recordings stay on your device.** Kadr never uploads recordings, camera or microphone
  input, or anything on your screen.
- **The only network request the desktop app makes on its own is the update check.** Spoken notes
  are the one opt-in exception: they send your microphone speech to your own OpenAI account (see
  below).

## What stays on your device

| Data                                  | Where                                                    |
| ------------------------------------- | -------------------------------------------------------- |
| Recordings                            | Your Videos folder (`Videos/Kadr`), as ordinary files    |
| Settings (bubble, devices, shortcuts) | The app's settings file in your user profile             |
| Downloaded updates                    | The app's update cache, until they are installed         |
| Last recorded region, bubble position | `window-state.json` in your user profile                 |
| Notes made while recording            | Next to the recording: `… notes.md` and a `.kadr` folder |
| Custom camera background image        | A copy in your user profile (`camera-background.img`)    |
| OpenAI API key (if you add one)       | Your user profile, encrypted with your system keychain   |

When a recording finishes, Kadr puts a reference to the file on your clipboard (not the video
itself), so you can paste it into another app. Turn this off in **Settings → More → Copy recordings
to clipboard**.

Camera, microphone and screen are accessed only while you use them: the camera while the bubble is
visible, and the screen, camera and microphone while you record. Light correction and camera
backgrounds (blur, remove, replace) run on your computer: a small person-detection model ships with
the app and processes frames on your graphics processor. Video frames never leave the app. Kadr
uses a version of Google's MediaPipe runtime that contains no usage reporting, and blocks its
reporting address in case a future version adds it back.

Notes you make while recording (the note button or shortcut) store the time, your words if they
were transcribed, and where your pointer was on the recorded screen. They are saved next to the
recording and go nowhere else.

## Network connections

**Desktop app — update checks.** Shortly after launch and every few hours, Kadr downloads a small
file from `updates.bilimgram.uz` to see whether a new version exists, and downloads the update if
one does. Like any web request, this reveals your IP address and the app version and operating
system in the request headers to the hosting provider (Cloudflare). No identifier, account or
usage data is sent. You can turn automatic updates off in **Settings → More → Updates**, and
organizations can disable updates entirely with `KADR_DISABLE_UPDATES=1`.

**Desktop app — spoken notes (off by default).** If you add your own OpenAI API key and turn on
**Settings → Notes → Listen for spoken notes**, Kadr sends what your microphone records to OpenAI's
transcription API (`api.openai.com`) while you record, one spoken phrase at a time, so it can catch
"add a note …". Silence is never sent, and neither are your screen, camera, computer sound or
files. Requests go straight from your computer to OpenAI with your key; OpenAI processes the audio
under its own terms and bills your account. Turn it off, or remove the key, in the same settings.

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
