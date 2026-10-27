import { pathToFileURL } from "node:url";
import { ClipboardItem, clipboard } from "electron";

/**
 * Puts a file on the clipboard, so it pastes into chats, emails and file managers. Electron writes
 * a `text/uri-list` item as the platform's native file list (CF_HDROP on Windows).
 */
export async function copyFileToClipboard(path: string): Promise<void> {
  const uriList = `${pathToFileURL(path).href}\r\n`;
  await clipboard.write([new ClipboardItem({ "text/uri-list": new Blob([uriList]) })]);
}
