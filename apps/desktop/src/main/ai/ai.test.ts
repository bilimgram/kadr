import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ApiKey } from "../../shared/schemas";
import { KeyStore, type SecretStorage } from "./keys";
import {
  NOTE_KEYWORDS,
  OPENAI_TRANSCRIBE_MODEL,
  ProviderError,
  testOpenAiKey,
  transcribeWithOpenAi,
} from "./openai";

/** Reversible stand-in for the OS keychain. */
function fakeStorage(available = true, backend = "dpapi"): SecretStorage {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plain) => Buffer.from(`enc:${[...plain].reverse().join("")}`),
    decryptString: (encrypted) => [...encrypted.toString().slice(4)].reverse().join(""),
    getSelectedStorageBackend: () => backend,
  };
}

const KEY = "sk-test-0123456789abcdefWXYZ";
const dirs: string[] = [];
const tempFile = () => {
  const dir = mkdtempSync(join(tmpdir(), "kadr-keys-"));
  dirs.push(dir);
  return join(dir, "ai-keys.json");
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("KeyStore", () => {
  it("encrypts keys on disk and reads them back", async () => {
    const file = tempFile();
    const store = new KeyStore(file, fakeStorage());
    const status = await store.set("openai", KEY);
    expect(status).toEqual({ provider: "openai", hasKey: true, hint: "WXYZ", persistent: true });
    expect(readFileSync(file, "utf8")).not.toContain(KEY);

    const reopened = new KeyStore(file, fakeStorage());
    await reopened.load();
    expect(reopened.get("openai")).toBe(KEY);
    await reopened.remove("openai");
    expect(reopened.status("openai").hasKey).toBe(false);
    const again = new KeyStore(file, fakeStorage());
    await again.load();
    expect(again.get("openai")).toBeNull();
  });

  it("keeps keys in memory only without real encryption", async () => {
    for (const storage of [fakeStorage(false), fakeStorage(true, "basic_text")]) {
      const file = tempFile();
      const store = new KeyStore(file, storage);
      expect((await store.set("openai", KEY)).persistent).toBe(false);
      expect(store.get("openai")).toBe(KEY);
      expect(() => readFileSync(file)).toThrow();
    }
  });

  it("only accepts plausible keys over IPC", () => {
    expect(ApiKey.parse(`  ${KEY}\n`)).toBe(KEY);
    expect(ApiKey.safeParse("short").success).toBe(false);
    expect(ApiKey.safeParse("sk-has a space in it 0123456789").success).toBe(false);
  });
});

type Call = { url: string; init: RequestInit };

function fakeFetch(responses: Array<() => Response>): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const queue = [...responses];
  return {
    calls,
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      const next = queue.shift();
      if (!next) throw new Error("unexpected request");
      return next();
    }) as typeof fetch,
  };
}

/** The multipart body of a recorded request. */
function formOf(call: Call | undefined): FormData {
  const body = call?.init.body;
  if (!(body instanceof FormData)) throw new Error("expected a multipart body");
  return body;
}

const json = (status: number, body: unknown) => () =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("OpenAI transcription", () => {
  const wav = new Uint8Array(100);

  it("sends the clip with the model, prompt, keywords and language hint", async () => {
    const { fetch, calls } = fakeFetch([
      json(200, { text: "Add a note: cut that", languages: [{ code: "en" }, { nope: 1 }] }),
    ]);
    const result = await transcribeWithOpenAi(KEY, wav, "en", fetch);
    expect(result).toEqual({ text: "Add a note: cut that", languages: ["en"] });
    const [call] = calls;
    expect(call?.url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect(new Headers(call?.init.headers).get("authorization")).toBe(`Bearer ${KEY}`);
    const form = formOf(call);
    expect(form.get("model")).toBe(OPENAI_TRANSCRIBE_MODEL);
    expect(form.getAll("keywords[]")).toEqual(NOTE_KEYWORDS);
    expect(form.getAll("languages[]")).toEqual(["en"]);
    expect(form.get("file")).toBeInstanceOf(Blob);
  });

  it("lets the provider detect the language when the hint is rejected or not given", async () => {
    const { fetch, calls } = fakeFetch([
      json(400, { error: { code: "invalid_language" } }),
      json(200, { text: "eslatma qo'sh" }),
    ]);
    expect((await transcribeWithOpenAi(KEY, wav, "uz", fetch)).text).toBe("eslatma qo'sh");
    expect(formOf(calls[1]).getAll("languages[]")).toEqual([]);

    const auto = fakeFetch([json(200, { text: "salom" })]);
    await transcribeWithOpenAi(KEY, wav, "auto", auto.fetch);
    expect(formOf(auto.calls[0]).getAll("languages[]")).toEqual([]);
  });

  it("explains failures without exposing request details", async () => {
    const cases: Array<[() => Response, string]> = [
      [json(401, {}), "auth"],
      [json(429, { error: { code: "insufficient_quota" } }), "quota"],
      [json(429, { error: { code: "rate_limit_exceeded" } }), "rate"],
      [json(503, {}), "server"],
    ];
    for (const [response, kind] of cases) {
      const { fetch } = fakeFetch([response]);
      const error = await transcribeWithOpenAi(KEY, wav, "auto", fetch).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).kind).toBe(kind);
      expect((error as ProviderError).message).not.toContain(KEY);
    }
    const offline = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    await expect(transcribeWithOpenAi(KEY, wav, "auto", offline)).rejects.toMatchObject({
      kind: "network",
    });
  });

  it("tests a key against the transcription model", async () => {
    expect((await testOpenAiKey(KEY, fakeFetch([json(200, {})]).fetch)).ok).toBe(true);
    expect(await testOpenAiKey(KEY, fakeFetch([json(404, {})]).fetch)).toMatchObject({ ok: false });
    expect((await testOpenAiKey(KEY, fakeFetch([json(401, {})]).fetch)).message).toBe(
      "OpenAI rejected the API key.",
    );
  });
});
