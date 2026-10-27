// Stands in for another app's always-on-top window (a call or video player) in the smoke tests:
// electron foreign-window.cjs <x> <y> <width> <height>. Prints SHOWN once it is up and focused.
const { app, BrowserWindow } = require("electron");

const [x, y, width, height] = process.argv.slice(-4).map(Number);

app.whenReady().then(() => {
  const win = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    backgroundColor: "#ff0000",
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
  });
  win.setAlwaysOnTop(true, "screen-saver");
  win.show();
  win.focus();
  console.log("SHOWN");
  setTimeout(() => app.quit(), 15_000);
});
