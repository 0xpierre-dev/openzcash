import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { arboristAnswer, arboristContext, arboristFilter } from "./arborist";
import { compactData } from "./data";
import type { ArboristCall } from "@/lib/arborist/feed";

const call = (over: Partial<ArboristCall>): ArboristCall => ({
  number: 100,
  date: "2026-01-08",
  rawDate: "8th Jan, 2026",
  duration: "15 minutes",
  video: "https://www.youtube.com/watch?v=abc123def",
  videoId: "abc123def",
  moderator: "Elena",
  notetaker: "Sam",
  agenda: ["Zebra 3.1 release", "NU7 status"],
  url: "https://github.com/ZcashCommunityGrants/arboretum-notes/blob/main/AllArboristCallNotes/Arborist%20Call%20100.md",
  source: "notes",
  ...over,
});
const calls: ArboristCall[] = [
  call({
    number: 132,
    date: "2026-09-24",
    source: "youtube",
    url: null,
    agenda: [],
    moderator: null,
  }),
  call({
    number: 131,
    date: "2026-09-10",
    agenda: ["Zaino indexer update", "Wallet interop"],
    moderator: "Dodger",
  }),
  call({
    number: 130,
    date: "2026-08-27",
    agenda: ["Tachyon research"],
    video: null,
    videoId: null,
  }),
  call({
    number: 12,
    date: "2020-03-05",
    source: "agenda",
    agenda: ["Heartwood"],
    moderator: null,
    notetaker: null,
  }),
];
const meta = {
  fetchedAt: "2026-09-28T10:00:00.000Z",
  repository: "https://github.com/ZcashCommunityGrants/arboretum-notes",
  recordings: "https://www.youtube.com/@zcashfoundation/videos",
};

describe("Arborist call lookup", () => {
  it("reads call numbers, months and agenda words from a question in either language", () => {
    expect(arboristFilter("What happened in call #131?")).toMatchObject({
      numbers: [131],
      dates: [],
    });
    expect(arboristFilter("Arborist Call 130 and 12")).toMatchObject({
      numbers: [130],
    });
    expect(arboristFilter("Arborist calls in September 2026")).toMatchObject({
      dates: ["2026-09"],
      numbers: [],
    });
    expect(arboristFilter("reuniões arborist de agosto de 2026")).toMatchObject(
      { dates: ["2026-08"] },
    );
    expect(
      arboristFilter("Which arborist call discussed Zaino?"),
    ).toMatchObject({ numbers: [], dates: [], tokens: ["zaino"] });
    for (const q of [
      "When is the next engineering call?",
      "Quando é a próxima reunião arborist?",
    ])
      expect(arboristFilter(q), q).toEqual({
        numbers: [],
        dates: [],
        tokens: [],
      });
    expect(arboristFilter("reunião arborist no 12 de março")).toMatchObject({
      numbers: [],
      tokens: ["marco"],
    });
    expect(arboristFilter("arborist call no 2026").numbers).toEqual([]);
    expect(arboristFilter("call no. 12").numbers).toEqual([12]);
  });
  it("returns the latest calls, not an empty list, for a next-call question", () => {
    expect(
      arboristContext(calls, "When is the next engineering call?", meta)
        .calls.length,
    ).toBe(4);
  });
  it("selects by number, then by month, then by agenda words, otherwise the latest calls", () => {
    expect(
      arboristContext(calls, "call #131", meta).calls.map((c) => c.number),
    ).toEqual([131]);
    expect(
      arboristContext(calls, "arborist September 2026", meta).calls.map(
        (c) => c.number,
      ),
    ).toEqual([132, 131]);
    expect(
      arboristContext(calls, "which call discussed tachyon", meta).calls.map(
        (c) => c.number,
      ),
    ).toEqual([130]);
    const latest = arboristContext(calls, "", meta);
    expect(latest.calls.map((c) => c.number)).toEqual([132, 131, 130, 12]);
    expect(latest).toMatchObject({
      archiveFetchedAt: meta.fetchedAt,
      totalCalls: 4,
      latestCall: { number: 132, date: "2026-09-24", source: "youtube" },
      matched: 4,
      notesRepository: meta.repository,
    });
    expect(latest.calls[0].source).toContain("provisional");
    expect(latest.calls[3].source).toContain("agenda only");
    expect(latest.calls[1]).toMatchObject({
      moderator: "Dodger",
      notes: expect.stringContaining("arboretum-notes"),
      recording: expect.stringContaining("youtube.com"),
    });
  });
  it("keeps the provenance ahead of the rows under the serialized budget", () => {
    const shown = compactData(arboristContext(calls, "", meta), "", 5000, 8)
      .data as Record<string, unknown>;
    const keys = Object.keys(shown);
    expect(keys[0]).toBe("archiveFetchedAt");
    expect(keys.indexOf("latestCall")).toBeLessThan(keys.indexOf("calls"));
    expect((shown.calls as { shown: unknown[] }).shown).toHaveLength(4);
  });
  it("answers the latest call from validated evidence with links, and links out when the archive is unavailable", () => {
    const content = JSON.stringify({
      sourceUrl: "https://openzcash.org/arborist",
      ...compactData(arboristContext(calls.slice(1), "", meta), "", 5000, 8),
    });
    const en = arboristAnswer(content, false);
    expect(en).toContain("**Arborist Call #131**, held on September 10, 2026");
    expect(en).toContain("Moderator: Dodger");
    expect(en).toContain("Agenda: Zaino indexer update; Wallet interop.");
    expect(en).toContain(
      "[Notes](https://github.com/ZcashCommunityGrants/arboretum-notes/",
    );
    expect(en).toContain(
      "[Recording](https://www.youtube.com/watch?v=abc123def)",
    );
    expect(en).toContain("not protocol decisions");
    const pt = arboristAnswer(content, true);
    expect(pt).toContain("realizada em 10 de setembro de 2026");
    expect(pt).toContain("Moderação: Dodger");
    expect(pt).toContain("[Notas](");
    const pending = arboristAnswer(
      JSON.stringify({
        ...compactData(arboristContext(calls, "", meta), "", 5000, 8),
      }),
      false,
    );
    expect(pending).toContain("#132");
    expect(pending).toContain("number is provisional");
    expect(pending).not.toContain("[Notes]");
    for (const content of [
      "{}",
      "bad json",
      JSON.stringify({ error: "unavailable" }),
      JSON.stringify({
        data: {
          calls: {
            shown: [
              {
                number: 5,
                date: "yesterday",
                notes: "javascript:alert(1)",
                recording: null,
                source: "notes",
              },
            ],
          },
        },
      }),
    ]) {
      const text = arboristAnswer(content, false);
      expect(text).toContain("could not be read");
      expect(text).toContain("https://openzcash.org/arborist");
      expect(text).not.toContain("#5");
    }
  });
});
