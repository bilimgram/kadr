import { contextBridge, type IpcRendererEvent, ipcRenderer } from "electron";
import { Channels, type KadrApi } from "../shared/api";

/** Subscribes to a main → renderer event and returns an unsubscribe function. */
function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

// Sandboxed preload: no Node APIs, only a narrow, typed bridge. Payloads are validated again in main.
const api: KadrApi = {
  platform: process.platform,
  settings: {
    get: () => ipcRenderer.invoke(Channels.settingsGet),
    update: (patch) => ipcRenderer.invoke(Channels.settingsUpdate, patch),
    onChange: (listener) => subscribe(Channels.settingsChanged, listener),
  },
  session: {
    get: () => ipcRenderer.invoke(Channels.sessionGet),
    report: (snapshot) => ipcRenderer.send(Channels.sessionReport, snapshot),
    command: (command) => ipcRenderer.invoke(Channels.sessionCommand, command),
    onChange: (listener) => subscribe(Channels.sessionChanged, listener),
    onCommand: (listener) => subscribe(Channels.sessionRunCommand, listener),
  },
  countdown: {
    run: (config) => ipcRenderer.invoke(Channels.countdownRun, config),
    getConfig: () => ipcRenderer.invoke(Channels.countdownGetConfig),
    finish: (result) => ipcRenderer.invoke(Channels.countdownFinish, result),
  },
  recording: {
    begin: (extension) => ipcRenderer.invoke(Channels.recordingBegin, extension),
    appendChunk: (id, data) => ipcRenderer.invoke(Channels.recordingChunk, id, data),
    finish: (id) => ipcRenderer.invoke(Channels.recordingFinish, id),
    discard: (id) => ipcRenderer.invoke(Channels.recordingDiscard, id),
    saveNotes: (id, sidecar) => ipcRenderer.invoke(Channels.recordingSaveNotes, id, sidecar),
  },
  shell: {
    showInFolder: (path) => ipcRenderer.invoke(Channels.shellShowInFolder, path),
    openPath: (path) => ipcRenderer.invoke(Channels.shellOpenPath, path),
    openRecordingsFolder: () => ipcRenderer.invoke(Channels.shellOpenRecordings),
    copyToClipboard: (path) => ipcRenderer.invoke(Channels.shellCopyFile, path),
  },
  region: {
    select: () => ipcRenderer.invoke(Channels.regionSelect),
    getContext: () => ipcRenderer.invoke(Channels.regionGetContext),
    update: (region) => ipcRenderer.send(Channels.regionUpdate, region),
    confirm: (region) => ipcRenderer.send(Channels.regionConfirm, region),
    cancel: () => ipcRenderer.send(Channels.regionCancel),
    onChange: (listener) => subscribe(Channels.regionChanged, listener),
  },
  window: {
    setIgnoreMouseEvents: (ignore) => ipcRenderer.send(Channels.windowSetIgnoreMouse, ignore),
    moveTo: (x, y) => ipcRenderer.send(Channels.windowMoveTo, x, y),
  },
  shortcuts: {
    get: () => ipcRenderer.invoke(Channels.shortcutsGet),
    onChange: (listener) => subscribe(Channels.shortcutsChanged, listener),
  },
  cursor: {
    position: () => ipcRenderer.invoke(Channels.cursorPosition),
  },
  notes: {
    transcribe: (audio, language) => ipcRenderer.invoke(Channels.notesTranscribe, audio, language),
  },
  ai: {
    status: (provider) => ipcRenderer.invoke(Channels.aiStatus, provider),
    setKey: (provider, key) => ipcRenderer.invoke(Channels.aiSetKey, provider, key),
    removeKey: (provider) => ipcRenderer.invoke(Channels.aiRemoveKey, provider),
    test: (provider) => ipcRenderer.invoke(Channels.aiTest, provider),
  },
  panel: {
    resize: (height) => ipcRenderer.send(Channels.panelResize, height),
    hide: () => ipcRenderer.send(Channels.panelHide),
    onVisibilityChange: (listener) => subscribe(Channels.panelVisibility, listener),
  },
  bubble: {
    isVisible: () => ipcRenderer.invoke(Channels.bubbleVisibilityGet),
    onVisibilityChange: (listener) => subscribe(Channels.bubbleVisibility, listener),
  },
  app: {
    quit: () => ipcRenderer.send(Channels.appQuit),
  },
  background: {
    chooseImage: () => ipcRenderer.invoke(Channels.backgroundChooseImage),
    getImage: () => ipcRenderer.invoke(Channels.backgroundGetImage),
  },
  updates: {
    get: () => ipcRenderer.invoke(Channels.updatesGet),
    check: () => ipcRenderer.invoke(Channels.updatesCheck),
    install: () => ipcRenderer.invoke(Channels.updatesInstall),
    onChange: (listener) => subscribe(Channels.updatesChanged, listener),
  },
};

contextBridge.exposeInMainWorld("kadr", api);
