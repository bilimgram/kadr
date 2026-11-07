import { findSpokenNote, type NoteEvent, spreadWords } from "@kadr/ai-editor";
import type { NormalizedPoint, TimeRange, Transcript, TranscriptWord } from "@kadr/project-format";
import {
  EventLog,
  encodeWav,
  levelDb,
  PcmBuffer,
  RecordingClock,
  SpeechDetector,
} from "@kadr/recorder-core";
import type { NotesSettings, NotesSidecar, NotesStatus } from "../../../shared/api";
import { IDLE_SNAPSHOT } from "../../../shared/session";
import micTapUrl from "./mic-tap.worklet.ts?worker&url";

const SAMPLE_RATE = 16_000;
/** Microphone levels are judged in 20 ms frames. */
const FRAME_SAMPLES = SAMPLE_RATE / 50;
const CURSOR_INTERVAL_MS = 100;
/** Audio kept before an utterance's detected start, so its first syllable isn't clipped. */
const PRE_ROLL_US = 250_000;
const POST_ROLL_US = 150_000;
/** Speech that starts this soon after the note shortcut is the note. */
const SHORTCUT_SPEECH_WINDOW_US = 4_000_000;
/** …or this little before it (the user started talking as they pressed). */
const SHORTCUT_SPEECH_LEAD_US = 500_000;
const MAX_QUEUED_CLIPS = 12;
/** How long stopping waits for transcriptions still in flight. */
const FINISH_TIMEOUT_MS = 8_000;
const CURSOR_HISTORY_US = 120_000_000;

interface CursorSample {
  t: number;
  position: NormalizedPoint;
}

interface MicTap {
  context: AudioContext;
  node: AudioWorkletNode;
  source: MediaStreamAudioSourceNode;
}

/** Electron prefixes errors thrown in main ("Error invoking remote method …: Error: …"). */
function cleanError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, "").slice(0, 300);
}

/**
 * Notes for a recording (ADR 0010). It keeps the recording's clock and event log, samples the
 * pointer, finds utterances from microphone levels (no AI), and turns the note shortcut and spoken
 * triggers ("add a note …") into note events. With listening on, each utterance is transcribed
 * with the user's own provider in the main process; without it, notes still mark the moment, the
 * pointer and the speech, for an editor or AI to transcribe later.
 */
export class NotesRecorder {
  private readonly clock = new RecordingClock();
  private readonly log = new EventLog(this.clock);
  private readonly detector = new SpeechDetector();
  private readonly buffer = new PcmBuffer(SAMPLE_RATE, 40_000_000);
  private readonly speech: TimeRange[] = [];
  private readonly notes: NoteEvent[] = [];
  private readonly words: TranscriptWord[] = [];
  private readonly cursor: CursorSample[] = [];
  private readonly languages = new Map<string, number>();
  private readonly pending = new Set<Promise<void>>();
  private awaitingSpeech: NoteEvent | null = null;
  private tap: MicTap | null = null;
  private cursorTimer: ReturnType<typeof setInterval> | null = null;
  private paused = false;
  private finished = false;
  private listening: boolean;
  private status: NotesStatus;
  private nextId = 1;
  private queue: TimeRange[] = [];
  private transcribing = false;
  /** After `dispose`, late transcriptions no longer report anything. */
  private silent = false;

  constructor(
    private readonly settings: NotesSettings,
    private readonly onChange: (status: NotesStatus) => void,
  ) {
    this.listening = settings.listen;
    this.status = { ...IDLE_SNAPSHOT.notes, listening: settings.listen ? "on" : "off" };
  }

  /** Starts with the recording. The microphone feeds speech detection; the pointer, notes' "where". */
  async start(microphone: MediaStreamTrack | null, recordsScreen: boolean): Promise<void> {
    this.clock.start();
    this.log.record({ type: "recording.resume" });
    this.publish();
    if (recordsScreen)
      this.cursorTimer = setInterval(() => void this.sampleCursor(), CURSOR_INTERVAL_MS);
    if (microphone) {
      try {
        this.tap = await this.startMicTap(microphone);
      } catch (error) {
        // Notes still work without speech detection; they just carry no speech range.
        console.warn("Microphone tap for notes is unavailable:", error);
        if (this.listening) this.fail("Spoken notes need the microphone.");
      }
    }
  }

  pause(): void {
    this.endUtterance();
    this.clock.pause();
    this.log.record({ type: "recording.pause" });
    this.paused = true;
  }

  resume(): void {
    this.clock.resume();
    this.log.record({ type: "recording.resume" });
    this.paused = false;
  }

  /** The note shortcut or toolbar button: marks now and where the pointer is; speech follows. */
  addNote(): void {
    if (this.finished || !this.clock.running) return;
    const t = this.clock.nowUs();
    const note: NoteEvent = {
      t,
      type: "note",
      id: `note-${this.nextId++}`,
      source: "shortcut",
      ...this.positionAt(t),
    };
    this.notes.push(note);
    this.awaitingSpeech = note;
    this.publish({ count: this.notes.length, lastText: null });
  }

  /** Stops everything and returns what to save, or null when nothing happened worth keeping. */
  async finish(): Promise<NotesSidecar | null> {
    if (this.finished) return null;
    this.endUtterance();
    // The recording ends now, not when the last transcription comes back.
    const durationUs = this.clock.nowUs();
    this.clock.pause();
    const segments = this.clock.segments();
    this.stopInputs();
    this.finished = true;
    await Promise.race([
      this.drain(),
      new Promise((resolve) => setTimeout(resolve, FINISH_TIMEOUT_MS)),
    ]);
    if (segments.length === 0) return null;
    const events = [...this.log.events(), ...this.notes].sort((a, b) => a.t - b.t);
    return {
      segments,
      durationUs,
      events,
      speech: [...this.speech],
      transcript: this.transcript(),
    };
  }

  /** Stops without saving (restart, discard, failure). */
  dispose(): void {
    this.finished = true;
    this.silent = true;
    this.stopInputs();
    this.queue = [];
  }

  private transcript(): Transcript | null {
    if (this.words.length === 0) return null;
    const detected = [...this.languages.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const language =
      detected ?? (this.settings.language === "auto" ? "und" : this.settings.language);
    return {
      formatVersion: 1,
      language,
      provider: "openai",
      model: "gpt-transcribe",
      timing: "segment",
      words: [...this.words].sort((a, b) => a.startUs - b.startUs),
    };
  }

  private async startMicTap(microphone: MediaStreamTrack): Promise<MicTap> {
    // The context resamples the microphone to 16 kHz, the rate speech-to-text expects.
    const context = new AudioContext({ sampleRate: SAMPLE_RATE });
    await context.audioWorklet.addModule(micTapUrl);
    const source = context.createMediaStreamSource(new MediaStream([microphone]));
    const node = new AudioWorkletNode(context, "kadr-mic-tap", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      channelCountMode: "explicit",
    });
    node.port.onmessage = (event: MessageEvent<Float32Array>) => this.onSamples(event.data);
    // A silent output keeps the graph pulling audio through the tap.
    const mute = context.createGain();
    mute.gain.value = 0;
    source.connect(node).connect(mute).connect(context.destination);
    return { context, node, source };
  }

  private onSamples(samples: Float32Array): void {
    if (this.paused || this.finished || !this.clock.running) return;
    const endUs = this.clock.nowUs();
    const startUs = endUs - (samples.length / SAMPLE_RATE) * 1e6;
    this.buffer.append(samples, startUs);
    for (let offset = 0; offset + FRAME_SAMPLES <= samples.length; offset += FRAME_SAMPLES) {
      const frameEnd = startUs + ((offset + FRAME_SAMPLES) / SAMPLE_RATE) * 1e6;
      const ended = this.detector.push(
        Math.round(frameEnd),
        levelDb(samples.subarray(offset, offset + FRAME_SAMPLES)),
      );
      if (ended) this.onUtterance(ended);
    }
  }

  private endUtterance(): void {
    if (!this.clock.running) return;
    const ended = this.detector.flush(this.clock.nowUs());
    if (ended) this.onUtterance(ended);
  }

  private onUtterance(range: TimeRange): void {
    this.speech.push(range);
    const awaiting = this.awaitingSpeech;
    if (awaiting) {
      if (
        range.startUs >= awaiting.t - SHORTCUT_SPEECH_LEAD_US &&
        range.startUs <= awaiting.t + SHORTCUT_SPEECH_WINDOW_US
      ) {
        awaiting.speech = range;
        this.awaitingSpeech = null;
      } else if (range.startUs > awaiting.t + SHORTCUT_SPEECH_WINDOW_US) {
        this.awaitingSpeech = null;
      }
    }
    if (this.listening) this.enqueue(range);
  }

  private enqueue(range: TimeRange): void {
    // Better to skip a clip than to fall minutes behind on a slow connection.
    if (this.queue.length >= MAX_QUEUED_CLIPS) this.queue.shift();
    this.queue.push(range);
    if (!this.transcribing) this.track(this.pump());
  }

  private track(work: Promise<void>): void {
    this.pending.add(work);
    void work.finally(() => this.pending.delete(work));
  }

  private async drain(): Promise<void> {
    while (this.pending.size > 0) await Promise.allSettled([...this.pending]);
  }

  /** Transcribes queued utterances one at a time, in order. */
  private async pump(): Promise<void> {
    this.transcribing = true;
    try {
      while (this.listening && this.queue.length > 0) {
        const range = this.queue.shift();
        if (range) await this.transcribe(range);
      }
    } finally {
      this.transcribing = false;
    }
  }

  private async transcribe(range: TimeRange): Promise<void> {
    const samples = this.buffer.slice(range.startUs - PRE_ROLL_US, range.endUs + POST_ROLL_US);
    if (samples.length < SAMPLE_RATE / 4) return;
    try {
      const result = await window.kadr.notes.transcribe(
        encodeWav(samples, SAMPLE_RATE),
        this.settings.language,
      );
      for (const code of result.languages) {
        this.languages.set(code, (this.languages.get(code) ?? 0) + 1);
      }
      if (this.status.listening === "error") this.publish({ listening: "on", message: null });
      this.onTranscript(result.text.trim(), range);
    } catch (error) {
      const message = cleanError(error);
      // A missing or rejected key, or no credit, won't fix itself during this recording.
      if (/key|credit|transcription model/i.test(message)) {
        this.listening = false;
        this.queue = [];
      }
      this.fail(message);
    }
  }

  private onTranscript(text: string, range: TimeRange): void {
    if (!text) return;
    this.words.push(...spreadWords(text, range));
    const found = findSpokenNote(text);
    // A shortcut note whose speech this is: the words are its text (minus a trigger, if said).
    const shortcutNote = this.notes.find(
      (note) =>
        note.source === "shortcut" &&
        note.speech?.startUs === range.startUs &&
        note.speech.endUs === range.endUs,
    );
    if (shortcutNote) {
      shortcutNote.text = (found?.text || text).slice(0, 4000);
      this.publish({ lastText: shortcutNote.text.slice(0, 300) });
      return;
    }
    if (!found) return;
    // Where in the utterance the trigger was said, by its position in the text.
    const share = text.length > 0 ? found.start / text.length : 0;
    const span = range.endUs - range.startUs;
    let startUs = range.startUs + Math.round(share * span);
    if (range.endUs - startUs < 100_000) startUs = range.startUs;
    const note: NoteEvent = {
      t: startUs,
      type: "note",
      id: `note-${this.nextId++}`,
      source: "voice",
      speech: { startUs, endUs: range.endUs },
      ...(found.text && { text: found.text.slice(0, 4000) }),
      ...this.positionAt(startUs),
    };
    this.notes.push(note);
    this.publish({ count: this.notes.length, lastText: found.text.slice(0, 300) || null });
  }

  private async sampleCursor(): Promise<void> {
    if (this.paused || this.finished || !this.clock.running) return;
    const position = await window.kadr.cursor.position().catch(() => null);
    if (!position || this.finished) return;
    const last = this.cursor.at(-1)?.position;
    if (last && Math.abs(last.x - position.x) < 0.002 && Math.abs(last.y - position.y) < 0.002) {
      return;
    }
    const event = this.log.record({ type: "cursor.move", position });
    this.cursor.push({ t: event.t, position });
    while (this.cursor.length > 1 && (this.cursor[0]?.t ?? 0) < event.t - CURSOR_HISTORY_US) {
      this.cursor.shift();
    }
  }

  /** The pointer position at `t` (the latest sample before it), as a note field. */
  private positionAt(t: number): { position?: NormalizedPoint } {
    let found: CursorSample | undefined;
    for (const sample of this.cursor) {
      if (sample.t > t) break;
      found = sample;
    }
    return found ? { position: found.position } : {};
  }

  private stopInputs(): void {
    if (this.cursorTimer) clearInterval(this.cursorTimer);
    this.cursorTimer = null;
    const tap = this.tap;
    this.tap = null;
    if (tap) {
      tap.node.port.onmessage = null;
      tap.source.disconnect();
      tap.node.disconnect();
      void tap.context.close().catch(() => undefined);
    }
  }

  private fail(message: string): void {
    this.publish({ listening: "error", message });
  }

  private publish(patch: Partial<NotesStatus> = {}): void {
    if (this.silent) return;
    this.status = { ...this.status, ...patch };
    this.onChange(this.status);
  }
}
