import { describe, expect, it } from "vitest";
import {
  mergeArboristCalls,
  parseArboristYoutubeFeed,
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
  it("prepends only unmatched recordings newer than the latest published note", () => {
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
