import {
  app,
  BrowserWindow,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  ipcMain,
  shell,
} from "electron";
import { z } from "zod";
import { type ActiveShortcuts, Channels } from "../shared/api";
import { isTrustedOrigin } from "../shared/origin";
import {
  AppSettingsPatch,
  CountdownConfig,
  CountdownResult,
  FilePath,
  PanelHeight,
  RecordingChunk,
  RecordingExtension,
  RecordingId,
  Region,
  ScreenCoordinate,
  SessionCommand,
  SessionSnapshot,
} from "../shared/schemas";
import { copyFileToClipboard } from "./clipboard";
import type { RecordingStore } from "./recordings";
import type { SessionCoordinator } from "./session";
import type { SettingsStore } from "./settings-store";
import type { UpdateService } from "./updater";
import type { WindowManager } from "./windows";

interface IpcDependencies {
  devServerUrl: string | undefined;
  recordings: RecordingStore;
  settings: SettingsStore;
  session: SessionCoordinator;
  windows: WindowManager;
  shortcuts: ActiveShortcuts;
  updates: UpdateService;
}

type Parsed<Schemas extends readonly z.ZodType[]> = { [K in keyof Schemas]: z.infer<Schemas[K]> };

export function registerIpc(deps: IpcDependencies): void {
  const { devServerUrl, recordings, settings, session, windows, shortcuts, updates } = deps;

  const validate = <const Schemas extends readonly z.ZodType[]>(
    channel: string,
    event: IpcMainEvent | IpcMainInvokeEvent,
    schemas: Schemas,
    args: unknown[],
  ): Parsed<Schemas> => {
    if (!isTrustedOrigin(event.senderFrame?.url, devServerUrl)) {
      throw new Error(`Untrusted sender for ${channel}`);
    }
    if (args.length !== schemas.length) throw new Error(`Invalid arguments for ${channel}`);
    return schemas.map((schema, index) => schema.parse(args[index])) as Parsed<Schemas>;
  };

  /** Request/response channel: trusted senders only, every argument validated with Zod. */
  const handle = <const Schemas extends readonly z.ZodType[]>(
    channel: string,
    schemas: Schemas,
    handler: (event: IpcMainInvokeEvent, ...args: Parsed<Schemas>) => unknown,
  ) => {
    ipcMain.handle(channel, (event, ...args: unknown[]) =>
      handler(event, ...validate(channel, event, schemas, args)),
    );
  };

  /** Fire-and-forget channel with the same checks; invalid messages are dropped and logged. */
  const on = <const Schemas extends readonly z.ZodType[]>(
    channel: string,
    schemas: Schemas,
    handler: (event: IpcMainEvent, ...args: Parsed<Schemas>) => void,
  ) => {
    ipcMain.on(channel, (event, ...args: unknown[]) => {
      try {
        handler(event, ...validate(channel, event, schemas, args));
      } catch (error) {
        console.warn(`Rejected IPC message on ${channel}:`, error);
      }
    });
  };

  const isControlWindow = (event: IpcMainEvent | IpcMainInvokeEvent) =>
    BrowserWindow.fromWebContents(event.sender) === windows.control;
  const senderWindow = (event: IpcMainEvent | IpcMainInvokeEvent) =>
    BrowserWindow.fromWebContents(event.sender);
  const isRegionPicker = (event: IpcMainEvent | IpcMainInvokeEvent) =>
    windows.regionPickerDisplayId(senderWindow(event)) !== null;

  // Settings and shortcuts
  handle(Channels.shortcutsGet, [], () => shortcuts);
  handle(Channels.bubbleVisibilityGet, [], () => windows.isBubbleVisible());
  handle(Channels.settingsGet, [], () => settings.get());
  handle(Channels.settingsUpdate, [AppSettingsPatch], (_event, patch) => settings.update(patch));

  // Updates
  handle(Channels.updatesGet, [], () => updates.getState());
  handle(Channels.updatesCheck, [], () => updates.check());
  handle(Channels.updatesInstall, [], () => updates.install());

  // Session
  handle(Channels.sessionGet, [], () => session.getSnapshot());
  on(Channels.sessionReport, [SessionSnapshot], (event, snapshot) => {
    if (isControlWindow(event)) session.report(snapshot);
  });
  handle(Channels.sessionCommand, [SessionCommand], (_event, command) => session.command(command));

  // Countdown
  handle(Channels.countdownRun, [CountdownConfig], (event, config) => {
    if (!isControlWindow(event)) throw new Error("Only the recording engine can start a countdown");
    return session.runCountdown(config);
  });
  handle(Channels.countdownGetConfig, [], () => {
    const config = session.getCountdownConfig();
    if (!config) throw new Error("No countdown is running");
    return config;
  });
  handle(Channels.countdownFinish, [CountdownResult], (event, result) => {
    if (windows.isCountdownWindow(BrowserWindow.fromWebContents(event.sender))) {
      session.finishCountdown(result);
    }
  });

  // Recording files
  handle(Channels.recordingBegin, [RecordingExtension], (_event, extension) =>
    recordings.begin(extension),
  );
  handle(Channels.recordingChunk, [RecordingId, RecordingChunk], (_event, id, chunk) => {
    const bytes =
      chunk instanceof ArrayBuffer
        ? new Uint8Array(chunk)
        : new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    return recordings.append(id, bytes);
  });
  handle(Channels.recordingFinish, [RecordingId], (_event, id) => recordings.finish(id));
  handle(Channels.recordingDiscard, [RecordingId], (_event, id) => recordings.discard(id));

  // Shell — restricted to the recordings folder.
  const assertRecordingPath = (path: string) => {
    if (!recordings.contains(path)) throw new Error("Path is outside the recordings folder");
  };
  handle(Channels.shellShowInFolder, [FilePath], (_event, path) => {
    assertRecordingPath(path);
    shell.showItemInFolder(path);
  });
  handle(Channels.shellOpenPath, [FilePath], async (_event, path) => {
    assertRecordingPath(path);
    const error = await shell.openPath(path);
    if (error) throw new Error(error);
  });
  handle(Channels.shellOpenRecordings, [], async () => {
    const error = await shell.openPath(await recordings.ensureDirectory());
    if (error) throw new Error(error);
  });
  handle(Channels.shellCopyFile, [FilePath], async (_event, path) => {
    assertRecordingPath(path);
    await copyFileToClipboard(path);
  });

  // Region picker: started by the recording engine, answered by the picker overlays.
  handle(Channels.regionSelect, [], (event) => {
    if (!isControlWindow(event)) throw new Error("Only the recording engine can pick a region");
    return session.selectRegion();
  });
  handle(Channels.regionGetContext, [], (event) => {
    const context = windows.regionPickerContext(senderWindow(event));
    if (!context) throw new Error("Not a region picker");
    return context;
  });
  on(Channels.regionUpdate, [Region.nullable()], (event, region) => {
    const win = senderWindow(event);
    if (win && isRegionPicker(event)) windows.forwardRegionSelection(region, win);
  });
  on(Channels.regionConfirm, [Region], (event, region) => {
    if (isRegionPicker(event)) session.confirmRegion(region);
  });
  on(Channels.regionCancel, [], (event) => {
    if (isRegionPicker(event)) session.finishRegion(null);
  });

  // Floating windows (toolbar, bubble)
  on(Channels.windowSetIgnoreMouse, [z.boolean()], (event, ignore) => {
    BrowserWindow.fromWebContents(event.sender)?.setIgnoreMouseEvents(ignore, { forward: true });
  });
  on(Channels.windowMoveTo, [ScreenCoordinate, ScreenCoordinate], (event, x, y) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && win !== windows.control) {
      win.setPosition(x, y);
      windows.noteUserMoved(win);
    }
  });

  // Control panel and app lifetime
  on(Channels.panelResize, [PanelHeight], (event, height) => {
    if (isControlWindow(event)) windows.resizeControl(height);
  });
  on(Channels.panelHide, [], (event) => {
    if (isControlWindow(event)) windows.hideControl();
  });
  on(Channels.appQuit, [], () => app.quit());
}
