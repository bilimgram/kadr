// Electron 45+ downloads its binary lazily on the first `require("electron")` instead of in a
// postinstall script, but electron-vite expects the binary to exist already. Requiring it here
// downloads it once on a fresh clone and is a no-op afterwards.
require("electron");
