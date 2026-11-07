import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app, safeStorage } from "electron";
import type { AiKeyStatus, AiProvider } from "../../shared/api";

/** The parts of Electron's `safeStorage` the key store uses (a fake in tests). */
export interface SecretStorage {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(encrypted: Buffer): string;
  getSelectedStorageBackend?(): string;
}

/**
 * API keys for AI providers, encrypted with the OS keychain (`safeStorage`) in the user data
 * folder. Keys live only in the main process: renderers can set, test and remove a key, never read
 * it back. Without real encryption (Linux without a keyring falls back to "basic_text") a key is
 * kept in memory until Kadr quits.
 */
export class KeyStore {
  private readonly keys = new Map<AiProvider, string>();
  private persisted = new Set<AiProvider>();

  constructor(
    private readonly file = join(app.getPath("userData"), "ai-keys.json"),
    private readonly storage: SecretStorage = safeStorage,
  ) {}

  /** Whether keys can be stored encrypted on disk. */
  get canPersist(): boolean {
    return (
      this.storage.isEncryptionAvailable() &&
      this.storage.getSelectedStorageBackend?.() !== "basic_text"
    );
  }

  async load(): Promise<void> {
    if (!this.canPersist) return;
    try {
      const stored = JSON.parse(await readFile(this.file, "utf8")) as Record<string, unknown>;
      const encrypted = stored.openai;
      if (typeof encrypted === "string") {
        this.keys.set("openai", this.storage.decryptString(Buffer.from(encrypted, "base64")));
        this.persisted.add("openai");
      }
    } catch {
      // No file yet, or it can't be decrypted on this machine: start without keys.
    }
  }

  get(provider: AiProvider): string | null {
    return this.keys.get(provider) ?? null;
  }

  async set(provider: AiProvider, key: string): Promise<AiKeyStatus> {
    this.keys.set(provider, key);
    if (this.canPersist) {
      await this.persist();
      this.persisted.add(provider);
    } else {
      this.persisted.delete(provider);
    }
    return this.status(provider);
  }

  async remove(provider: AiProvider): Promise<AiKeyStatus> {
    this.keys.delete(provider);
    this.persisted.delete(provider);
    if (this.canPersist) await this.persist();
    return this.status(provider);
  }

  status(provider: AiProvider): AiKeyStatus {
    const key = this.keys.get(provider);
    return {
      provider,
      hasKey: Boolean(key),
      hint: key ? key.slice(-4) : null,
      persistent: key ? this.persisted.has(provider) : this.canPersist,
    };
  }

  private async persist(): Promise<void> {
    const stored: Record<string, string> = {};
    for (const [provider, key] of this.keys) {
      stored[provider] = this.storage.encryptString(key).toString("base64");
    }
    const temporary = `${this.file}.tmp`;
    await writeFile(temporary, JSON.stringify(stored), { mode: 0o600 });
    await rename(temporary, this.file);
  }
}
