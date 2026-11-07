import { readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app, type BrowserWindow, dialog } from "electron";
import type { BackgroundImage } from "../shared/api";
import { detectImageType, MAX_BACKGROUND_IMAGE_BYTES } from "../shared/images";

/**
 * The custom camera background, copied into the user data folder so it survives the original file
 * being moved or deleted. Renderers never get a path: they ask for the bytes.
 */
export class BackgroundImageStore {
  constructor(private readonly file = join(app.getPath("userData"), "camera-background.img")) {}

  /** Lets the user pick an image; resolves false when they cancel. Rejects unusable files. */
  async choose(parent: BrowserWindow | null): Promise<boolean> {
    const options: Electron.OpenDialogOptions = {
      title: "Choose a background image",
      properties: ["openFile"],
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
    };
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options);
    const source = result.filePaths[0];
    if (result.canceled || !source) return false;

    const { size } = await stat(source);
    if (size > MAX_BACKGROUND_IMAGE_BYTES) throw new Error("That image is larger than 20 MB.");
    const bytes = await readFile(source);
    if (!detectImageType(bytes)) throw new Error("Choose a PNG, JPEG or WebP image.");
    const temporary = `${this.file}.tmp`;
    await writeFile(temporary, bytes);
    await rename(temporary, this.file);
    return true;
  }

  /** The saved image, or null when there is none (or it is no longer readable). */
  async read(): Promise<BackgroundImage | null> {
    try {
      const data = new Uint8Array(await readFile(this.file));
      const mimeType = detectImageType(data);
      return mimeType ? { data, mimeType } : null;
    } catch {
      return null;
    }
  }
}
