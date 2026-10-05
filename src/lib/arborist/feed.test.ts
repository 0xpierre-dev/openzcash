import { describe, expect, it } from "vitest";
import {
  mergeArboristCalls,
  parseArboristAgenda,
  parseArboristYoutubeFeed,
  parseArboristYoutubePage,
  ARBORIST_CHANNEL_ID,
  type ArboristCall,
} from "./feed";

function note(
  number: number,
  date: string,
  videoId: string | null = null,
): ArboristCall {
  return {
    number,
    date,
    rawDate: date,
    duration: "60 minutes",
    video: videoId
      ? `https://www.youtube.com/watch?v=${videoId}`
      : null,
    videoId,
    moderator: "Moderator",
    notetaker: "Notetaker",
    agenda: ["Protocol updates"],
    url: `https://github.com/example/call-${number}.md`,
    source: "notes",
  };
}

describe("parseArboristAgenda", () => {
  it("parses the historical agenda records that predate full call notes", () => {
    const markdown = `
# Arborist Call 1 Agenda

Meeting Date: October 30th, 2020

Duration: 1 hour 15 minutes

[YouTube Recording](https://youtu.be/czK65XWtlAM)

## Agenda
___

1. Welcome and Meeting Intro
2. Research & Implementation Status Updates

   Deirdre Connolly - Zebrad

3. Presentations

   + Potential Network Upgrade Pipeline (NUP) Improvements

4. Wrap up / Read Out
`;

    expect(
      parseArboristAgenda(
        markdown,
        "Arborist Call 1 Agenda.md",
        "https://github.com/example/AgendaArchive/Arborist-Call-1-Agenda.md",
      ),
    ).toEqual({
      number: 1,
      date: "2020-10-30",
      rawDate: "October 30th, 2020",
      duration: "1 hour 15 minutes",
      video: "https://youtu.be/czK65XWtlAM",
      videoId: "czK65XWtlAM",
      moderator: null,
      notetaker: null,
      agenda: [
        "Welcome and Meeting Intro",
        "Research & Implementation Status Updates",
        "Presentations",
        "Potential Network Upgrade Pipeline (NUP) Improvements",
        "Wrap up / Read Out",
      ],
      url: "https://github.com/example/AgendaArchive/Arborist-Call-1-Agenda.md",
      source: "agenda",
    });
  });
});

describe("parseArboristYoutubeFeed", () => {
  it("creates pending-note records from Arborist titles using the meeting date", () => {
    const xml = `
      <feed xmlns:yt="http://www.youtube.com/xml/schemas/2015">
        <entry>
          <yt:videoId>doDbR0i9zZA</yt:videoId>
          <title>Arborist Call 08-20-2026</title>
          <published>2026-08-21T09:31:20Z</published>
        </entry>
        <entry>
          <yt:videoId>POkZ42EgXNQ</yt:videoId>
          <title>Arborist Call 09-3-2026</title>
          <published>2026-09-04T10:24:21Z</published>
        </entry>
        <entry>
          <yt:videoId>unrelated123</yt:videoId>
          <title>Zcash Foundation Update</title>
          <published>2026-09-04T12:00:00Z</published>
        </entry>
      </feed>
    `;

    expect(parseArboristYoutubeFeed(xml)).toEqual([
      expect.objectContaining({
        number: null,
        date: "2026-08-20",
        video: "https://www.youtube.com/watch?v=doDbR0i9zZA",
        videoId: "doDbR0i9zZA",
        source: "youtube",
        url: null,
      }),
      expect.objectContaining({
        number: null,
        date: "2026-09-03",
        video: "https://www.youtube.com/watch?v=POkZ42EgXNQ",
        videoId: "POkZ42EgXNQ",
        source: "youtube",
        url: null,
      }),
    ]);
  });
});

describe("mergeArboristCalls", () => {
  it("retains unmatched recordings without inventing their call numbers", () => {
    const calls = mergeArboristCalls(
      [note(129, "2026-08-06", "existing129")],
      [
        ...parseArboristYoutubeFeed(`
          <feed xmlns:yt="http://www.youtube.com/xml/schemas/2015">
            <entry>
              <yt:videoId>doDbR0i9zZA</yt:videoId>
              <title>Arborist Call 08-20-2026</title>
            </entry>
            <entry>
              <yt:videoId>POkZ42EgXNQ</yt:videoId>
              <title>Arborist Call 09-3-2026</title>
            </entry>
            <entry>
              <yt:videoId>oldCallVideo</yt:videoId>
              <title>Arborist Call 07-23-2026</title>
            </entry>
          </feed>
        `),
      ],
    );

    expect(calls.map(({ number, date, source }) => ({ number, date, source })))
      .toEqual([
        { number: null, date: "2026-09-03", source: "youtube" },
        { number: null, date: "2026-08-20", source: "youtube" },
        { number: 129, date: "2026-08-06", source: "notes" },
        { number: null, date: "2026-07-23", source: "youtube" },
      ]);
  });

  it("replaces a pending recording with its note and keeps the video link", () => {
    const recording = parseArboristYoutubeFeed(`
      <feed xmlns:yt="http://www.youtube.com/xml/schemas/2015">
        <entry>
          <yt:videoId>doDbR0i9zZA</yt:videoId>
          <title>Arborist Call 08-20-2026</title>
        </entry>
      </feed>
    `);

    const calls = mergeArboristCalls(
      [note(130, "2026-08-20"), note(129, "2026-08-06", "existing129")],
      recording,
    );

    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(
      expect.objectContaining({
        number: 130,
        date: "2026-08-20",
        source: "notes",
        url: "https://github.com/example/call-130.md",
        video: "https://www.youtube.com/watch?v=doDbR0i9zZA",
        videoId: "doDbR0i9zZA",
      }),
    );
  });
});

describe("official YouTube channel HTML fallback", () => {
  const video = (title = "Arborist Call 10-1-2026", contentId = "gJA1brRxnf4", extra = {}) => ({ lockupViewModel: {
    contentId, contentType: "LOCKUP_CONTENT_TYPE_VIDEO", metadata: { lockupMetadataViewModel: { title: { content: title } } }, ...extra,
  } });
  const page = (content: unknown, id = ARBORIST_CHANNEL_ID) => `<script>var ytInitialData = ${JSON.stringify({ metadata: { channelMetadataRenderer: { externalId: id } }, contents: { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: { selected: true, content } }] } } })};</script>`;
  it("reads the actual lockup metadata shape and derives only a validated video URL/date", () => {
    expect(parseArboristYoutubePage(page([video(), video(), video("Foundation update", "other123456")]))).toEqual([
      expect.objectContaining({ number: null, date: "2026-10-01", videoId: "gJA1brRxnf4", video: "https://www.youtube.com/watch?v=gJA1brRxnf4", url: null, source: "youtube" }),
    ]);
  });
  it("supports older videoRenderer uploads without taking dates from upload text", () => {
    const result = parseArboristYoutubePage(page({ videoRenderer: { videoId: "gJA1brRxnf4", title: { runs: [{ text: "Arborist Call 10-1-2026" }] }, publishedTimeText: { simpleText: "today" } } }));
    expect(result[0].date).toBe("2026-10-01");
  });
  it("rejects another channel, login shells and executable JavaScript instead of JSON", () => {
    expect(() => parseArboristYoutubePage(page(video(), "another-channel"))).toThrow("ARBORIST_VIDEO_CHANNEL_UNVERIFIED");
    expect(() => parseArboristYoutubePage("<h1>Sign in</h1>")).toThrow();
    expect(() => parseArboristYoutubePage('<script>var ytInitialData = {"x":(()=>1)()};</script>')).toThrow();
  });
  it("excludes upcoming/live uploads and rejects ambiguous translated or malformed dates", () => {
    expect(parseArboristYoutubePage(page([video("Llamada Arborist 01/10/2026"), video("Arborist Call 02-30-2026"), video(undefined, undefined, { upcomingEventData: {} }), video(undefined, undefined, { badges: [{ metadataBadgeRenderer: { style: "BADGE_STYLE_TYPE_LIVE_NOW" } }] })]))).toEqual([]);
  });
  it("bounds the parser and excludes unsafe content ids", () => {
    expect(() => parseArboristYoutubePage("x".repeat(3 * 1024 * 1024 + 1))).toThrow("ARBORIST_VIDEO_PAGE_TOO_LARGE");
    expect(() => parseArboristYoutubePage(page(video(undefined, "https://evil")))).toThrow("ARBORIST_VIDEO_PAGE_NO_RECORDS");
  });
});
