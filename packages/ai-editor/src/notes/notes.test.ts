import type { TimeRange, Transcript } from "@kadr/project-format";
import { describe, expect, it } from "vitest";
import { buildEditContext } from "../context";
import { validateEditPlan } from "../plan";
import { interpretNote } from "./intent";
import { normalizeSpeech, parseSpokenNumber } from "./normalize";
import {
  clockToMediaUs,
  formatNotesMarkdown,
  formatTimestamp,
  type NoteEvent,
  notesEditPlan,
  retakeStart,
} from "./plan";
import { findSpokenNote } from "./triggers";
import { spreadWords } from "./words";

const s = (seconds: number) => Math.round(seconds * 1_000_000);
const now = () => new Date("2026-11-07T10:00:00.000Z");

describe("normalizing speech", () => {
  it("folds case, punctuation and the many o'/g' apostrophes", () => {
    expect(normalizeSpeech("Eslatma  qoʻsh, iltimos!").text).toBe("eslatma qo'sh iltimos");
    expect(normalizeSpeech("Eslatma qo‘sh").text).toBe("eslatma qo'sh");
    expect(normalizeSpeech("Eslatma qo`sh").text).toBe("eslatma qo'sh");
  });

  it("transliterates Uzbek Cyrillic and maps every character back", () => {
    const normalized = normalizeSpeech("Эслатма қўш: кес", { latin: true });
    expect(normalized.text).toBe("eslatma qo'sh kes");
    expect(normalized.sourceIndex).toHaveLength(normalized.text.length);
    // Both characters of "o'" come from "ў" (index 9); "sh" starts at "ш" (index 10).
    expect(normalized.sourceIndex[9]).toBe(9);
    expect(normalized.sourceIndex[10]).toBe(9);
    expect(normalized.sourceIndex[11]).toBe(10);
  });

  it("reads numbers in three languages", () => {
    expect(parseSpokenNumber(["5"])).toBe(5);
    expect(parseSpokenNumber(["twenty", "five"])).toBe(25);
    expect(parseSpokenNumber(["o'n", "besh"])).toBe(15);
    expect(parseSpokenNumber(["двадцать", "пять"])).toBe(25);
    expect(parseSpokenNumber(["few"])).toBeNull();
    expect(parseSpokenNumber([])).toBeNull();
  });
});

describe("finding spoken notes", () => {
  it.each([
    [
      "Add a note: cut this last few seconds, I'm restating it",
      "en",
      "cut this last few seconds, I'm restating it",
    ],
    ["so that's the dashboard. Add note, put a zoom here", "en", "put a zoom here"],
    ["Editor's note — blur the email address", "en", "blur the email address"],
    ["Eslatma qo'sh: oxirgi besh soniyani kes", "uz", "oxirgi besh soniyani kes"],
    ["eslatma qoʻshaman, bu yerga rasm qo'yish kerak", "uz", "bu yerga rasm qo'yish kerak"],
    ["Эслатма қўш, шу жойини кес", "uz", "шу жойини кес"],
    ["Kadr eslatma: qaytadan aytaman", "uz", "qaytadan aytaman"],
    ["Добавь заметку: вырежи последние пять секунд", "ru", "вырежи последние пять секунд"],
  ])("%s", (text, language, note) => {
    const found = findSpokenNote(text);
    expect(found?.language).toBe(language);
    expect(found?.text).toBe(note);
    if (found) expect(text.slice(found.textStart)).toBe(note);
  });

  it("ignores ordinary narration", () => {
    for (const text of [
      "Click the plus button to add notes to your project",
      "This note is important",
      "Eslatma juda muhim",
      "Заметка в приложении",
      "",
    ]) {
      expect(findSpokenNote(text), text).toBeNull();
    }
  });

  it("finds a trigger in the middle of a sentence", () => {
    const text = "and then we deploy it. Add a note: show the logs here.";
    const found = findSpokenNote(text);
    expect(found?.start).toBe(text.indexOf("Add"));
    expect(found?.text).toBe("show the logs here.");
  });
});

describe("interpreting notes", () => {
  it.each([
    ["cut the last 5 seconds", { kind: "cutLast", seconds: 5 }],
    ["please remove the last twenty five seconds", { kind: "cutLast", seconds: 25 }],
    ["cut the last ninety nine thousand seconds", { kind: "note" }],
    ["oxirgi besh soniyani kes", { kind: "cutLast", seconds: 5 }],
    ["вырежи последние десять секунд", { kind: "cutLast", seconds: 10 }],
    ["cut this last few seconds and I am restating it properly this time", { kind: "retake" }],
    ["let me say that again", { kind: "retake" }],
    ["qaytadan aytaman", { kind: "retake" }],
    ["shu joyini kes", { kind: "retake" }],
    ["заново", { kind: "retake" }],
    ["put a zoom on the save button here", { kind: "note" }],
    ["bu yerga rasm qo'shish kerak", { kind: "note" }],
  ])("%s", (text, intent) => {
    expect(interpretNote(text)).toEqual(intent);
  });

  it("caps how much a note can cut", () => {
    expect(interpretNote("cut the last 600 seconds")).toEqual({ kind: "cutLast", seconds: 60 });
  });
});

describe("retake start", () => {
  const speech: TimeRange[] = [
    { startUs: s(1), endUs: s(4) },
    { startUs: s(5), endUs: s(9) },
    { startUs: s(9.5), endUs: s(12) },
  ];

  it("cuts back to the start of the interrupted utterance", () => {
    expect(retakeStart(s(7), speech)).toBe(s(5));
  });

  it("cuts the previous utterance when the note starts a new one", () => {
    expect(retakeStart(s(9.5), speech)).toBe(s(5));
  });

  it("reaches back at most a minute, and needs speech data", () => {
    expect(retakeStart(s(100), [{ startUs: s(1), endUs: s(110) }])).toBe(s(40));
    expect(retakeStart(s(5), [])).toBeNull();
  });
});

const note = (patch: Partial<NoteEvent> & { t: number }): NoteEvent => ({
  type: "note",
  id: `n-${patch.t}`,
  source: "voice",
  ...patch,
});

describe("notes edit plan", () => {
  const speech: TimeRange[] = [
    { startUs: s(10), endUs: s(14) },
    { startUs: s(15), endUs: s(19) },
  ];

  it("proposes cutting the spoken note and the retake it asks for, as one valid cut", () => {
    const plan = notesEditPlan({
      notes: [
        note({
          t: s(15),
          text: "cut the last few seconds, I'm saying it again",
          speech: { startUs: s(15), endUs: s(19) },
        }),
      ],
      speech,
      durationUs: s(30),
      now,
    });
    expect(plan.source.kind).toBe("user");
    expect(plan.operations).toHaveLength(1);
    const [cut] = plan.operations;
    expect(cut).toMatchObject({
      type: "cut",
      status: "proposed",
      range: { startUs: s(10), endUs: s(19) },
    });
    expect(validateEditPlan(plan, s(30)).ok).toBe(true);
  });

  it("cuts the requested seconds, clamped to the recording", () => {
    const plan = notesEditPlan({
      notes: [
        note({ t: s(3), text: "cut the last 5 seconds", speech: { startUs: s(3), endUs: s(4) } }),
      ],
      speech: [],
      durationUs: s(30),
      now,
    });
    expect(plan.operations).toMatchObject([{ range: { startUs: 0, endUs: s(4) } }]);
  });

  it("keeps free-form notes and shortcut notes without speech out of the cuts", () => {
    const plan = notesEditPlan({
      notes: [note({ t: s(2), source: "shortcut" }), note({ t: s(8), text: "add a chart here" })],
      speech,
      durationUs: s(30),
      now,
    });
    expect(plan.operations).toEqual([]);
  });
});

describe("notes for people and AI", () => {
  const segments: TimeRange[] = [
    { startUs: 0, endUs: s(10) },
    { startUs: s(20), endUs: s(80) },
  ];

  it("shows times as positions in the video, with pauses removed", () => {
    expect(clockToMediaUs(s(5), segments)).toBe(s(5));
    expect(clockToMediaUs(s(15), segments)).toBe(s(10));
    expect(clockToMediaUs(s(25), segments)).toBe(s(15));
    expect(formatTimestamp(s(65))).toBe("1:05");
    expect(formatTimestamp(s(3723))).toBe("1:02:03");
  });

  it("writes a Markdown table and the suggested cuts", () => {
    const notes = [
      note({
        t: s(25),
        text: "zoom | in here",
        position: { x: 0.3, y: 0.6 },
        speech: { startUs: s(25), endUs: s(27) },
      }),
      note({ t: s(30), source: "shortcut" }),
    ];
    const plan = notesEditPlan({ notes, speech: [], durationUs: s(80), now });
    const markdown = formatNotesMarkdown({ videoFile: "Kadr 1.mp4", notes, plan, segments });
    expect(markdown).toContain("# Editing notes: Kadr 1.mp4");
    expect(markdown).toContain("| 1 | 0:15 | zoom \\| in here | 30% across, 60% down |");
    expect(markdown).toContain("| 2 | 0:20 | (marked moment) |  |");
    expect(markdown).toContain("- 0:15–0:17: Note 1");
  });

  it("puts notes into the AI editing context", () => {
    const transcript: Transcript = {
      formatVersion: 1,
      language: "en",
      provider: "test",
      words: [],
    };
    const context = buildEditContext({
      transcript,
      durationUs: s(30),
      events: [
        note({
          t: s(12),
          text: "cut that",
          position: { x: 0.5, y: 0.25 },
          speech: { startUs: s(12), endUs: s(13) },
        }),
      ],
    });
    expect(context).toContain("12.00 note (spoken 12.00-13.00) at (0.50, 0.25): cut that");
  });
});

describe("spreading a phrase over words", () => {
  it("weights words by length and stays inside the phrase", () => {
    const words = spreadWords("a longer phrase", { startUs: 0, endUs: 1_600_000 });
    expect(words.map((word) => word.text)).toEqual(["a", "longer", "phrase"]);
    expect(words[0]?.startUs).toBe(0);
    expect(words[2]?.endUs).toBe(1_600_000);
    expect((words[1]?.endUs ?? 0) - (words[1]?.startUs ?? 0)).toBeGreaterThan(
      (words[0]?.endUs ?? 0) - (words[0]?.startUs ?? 0),
    );
    expect(spreadWords("  ", { startUs: 0, endUs: 10 })).toEqual([]);
    expect(spreadWords("hi", { startUs: 10, endUs: 10 })).toEqual([]);
  });
});
