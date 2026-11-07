import { Button, Kbd, SegmentedControl, type SegmentedOption, Switch, TextField } from "@kadr/ui";
import { KeyRound, Trash, Wifi } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import type {
  AiKeyStatus,
  AiTestResult,
  AppSettingsPatch,
  NotesLanguage,
  NotesSettings as NotesSettingsValue,
} from "../../../shared/api";

const icon = { className: "k-icon", "aria-hidden": true } as const;

const LANGUAGE_OPTIONS: ReadonlyArray<SegmentedOption<NotesLanguage>> = [
  { value: "auto", label: "Auto" },
  { value: "en", label: "English" },
  { value: "uz", label: "Oʻzbek" },
  { value: "ru", label: "Русский" },
];

/** Electron prefixes errors thrown in main ("Error invoking remote method …: Error: …"). */
function cleanIpcError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, "");
}

/** The OpenAI key: status, save, test and remove. The key itself never comes back from main. */
function OpenAiKey({
  status,
  onStatus,
}: {
  status: AiKeyStatus | null;
  onStatus(next: AiKeyStatus): void;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AiTestResult | null>(null);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setResult(null);
    try {
      await work();
    } catch (error) {
      setResult({ ok: false, message: cleanIpcError(error) });
    } finally {
      setBusy(false);
    }
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      onStatus(await window.kadr.ai.setKey("openai", draft.trim()));
      setDraft("");
      setResult(await window.kadr.ai.test("openai"));
    });
  };

  const summary = !status?.hasKey
    ? "No key yet."
    : `Key ending in ${status.hint} is saved${status.persistent ? "" : " until Kadr quits (this system can't encrypt it)"}.`;

  return (
    <form className="k-field" onSubmit={save}>
      <TextField
        label="OpenAI API key"
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder={status?.hasKey ? "Paste a new key to replace it" : "sk-…"}
        value={draft}
        onChange={setDraft}
        hint={summary}
      />
      <div className="subview__actions">
        <Button
          type="submit"
          size="sm"
          variant="primary"
          icon={<KeyRound {...icon} />}
          disabled={busy || draft.trim().length < 20}
        >
          Save key
        </Button>
        {status?.hasKey && (
          <>
            <Button
              size="sm"
              icon={<Wifi {...icon} />}
              disabled={busy}
              onClick={() => void run(async () => setResult(await window.kadr.ai.test("openai")))}
            >
              Test
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash {...icon} />}
              disabled={busy}
              onClick={() =>
                void run(async () => onStatus(await window.kadr.ai.removeKey("openai")))
              }
            >
              Remove
            </Button>
          </>
        )}
      </div>
      {result && (
        <p className="subview__note" role="status">
          {result.message}
        </p>
      )}
    </form>
  );
}

/**
 * Notes while recording (ADR 0010): the note shortcut works offline; spoken notes ("add a note …")
 * transcribe the microphone with the user's own OpenAI key.
 */
export function NotesSettings({
  notes,
  update,
  shortcut,
  platform,
}: {
  notes: NotesSettingsValue;
  update(patch: AppSettingsPatch): void;
  /** The note shortcut, when one is held (only while recording). */
  shortcut: string | null;
  platform: string;
}) {
  const [status, setStatus] = useState<AiKeyStatus | null>(null);
  useEffect(() => {
    void window.kadr.ai.status("openai").then(setStatus);
  }, []);
  const hasKey = status?.hasKey ?? false;

  return (
    <>
      <p className="subview__note">
        While recording, press the note button on the toolbar
        {shortcut ? (
          <>
            {" "}
            or <Kbd shortcut={shortcut} platform={platform} />
          </>
        ) : (
          " or its shortcut"
        )}{" "}
        and say what to fix. Kadr marks the moment and where your pointer was, and saves the notes
        next to the video for editing later, by you or by an AI.
      </p>
      <Switch
        label="Listen for spoken notes"
        description={
          hasKey
            ? "Say “add a note”, “eslatma qoʻsh” or “добавь заметку”, then your note"
            : "Add your OpenAI key below to turn this on"
        }
        checked={notes.listen && hasKey}
        disabled={!hasKey}
        onChange={(listen) => update({ notes: { listen } })}
      />
      <div className="k-field">
        <span className="k-field__label">Language you speak</span>
        <SegmentedControl
          label="Language you speak"
          value={notes.language}
          options={LANGUAGE_OPTIONS}
          disabled={!notes.listen || !hasKey}
          onChange={(language) => update({ notes: { language } })}
        />
      </div>
      <OpenAiKey status={status} onStatus={setStatus} />
      <p className="subview__note">
        With spoken notes on, Kadr sends your microphone speech (never silence, your screen, camera
        or computer sound) to OpenAI while you record, using your key; OpenAI bills your account.
        The key is encrypted on this computer and never shown again.
      </p>
    </>
  );
}
