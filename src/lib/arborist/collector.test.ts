import { describe, expect, it, vi } from "vitest";
import { ARBORIST_REFRESH_MS, createArboristLoader, type ArboristSnapshot } from "./collector";
import { ARBORIST_CHANNEL_ID, type ArboristCall } from "./feed";
import { ARBORIST_README_URL, ARBORIST_YOUTUBE_FEED, ARBORIST_YOUTUBE_PAGE, arboristBlobUrl } from "./sources";

const old = "2026-10-04T12:00:00.000Z", at = Date.parse("2026-10-05T12:00:00.000Z");
const path = (n: number) => `AllArboristCallNotes/Arborist Call ${n} Notes.md`;
const call = (n: number): ArboristCall => ({ number: n, date: n === 132 ? "2026-09-17" : "2026-09-03", rawDate: "Source date", duration: null, video: null, videoId: null, moderator: null, notetaker: null, agenda: ["Source agenda"], url: arboristBlobUrl(path(n)), source: "notes" });
const video: ArboristCall = { ...call(132), number: null, date: "2026-10-01", rawDate: "10-1-2026", url: null, source: "youtube", videoId: "gJA1brRxnf4", video: "https://www.youtube.com/watch?v=gJA1brRxnf4" };
const snapshot = (numbers = [132, 131]): ArboristSnapshot => ({ schemaVersion: 1, collectedAt: old, notes: numbers.map(n => ({ path: path(n), sha: "a".repeat(40), checkedAt: old, call: call(n) })), recordings: [video], sourceUrls: [] });
const markdown = (n: number) => `# Arborist Call ${n}\nMeeting Date/Time: ${n === 133 ? "1 October" : n === 132 ? "17 September" : "3 September"} 2026\nAgenda:\n1. Engineering\nModerator: Source\n## Full Notes\n${"Published source notes. ".repeat(20)}`;
const text = (body: string, contentType = "text/plain") => new Response(body, { headers: { "content-type": contentType } });
const html = () => `<script>var ytInitialData = ${JSON.stringify({ metadata: { channelMetadataRenderer: { externalId: ARBORIST_CHANNEL_ID } }, contents: { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: { selected: true, content: { lockupViewModel: { contentId: "gJA1brRxnf4", contentType: "LOCKUP_CONTENT_TYPE_VIDEO", metadata: { lockupMetadataViewModel: { title: { content: "Arborist Call 10-1-2026" } } } } } } }] } } })};</script>`;
function fetchFixture(options: { api?: boolean; numbers?: number[]; failNote?: number; sameSha?: boolean; feed?: boolean } = {}) {
  return vi.fn<typeof fetch>().mockImplementation(async input => {
    const url = String(input);
    if (url === ARBORIST_YOUTUBE_FEED) return options.feed ? text('<feed xmlns="http://www.w3.org/2005/Atom"></feed>', "application/atom+xml") : new Response("Not found", { status: 404 });
    if (url === ARBORIST_YOUTUBE_PAGE) return text(html(), "text/html");
    if (url === ARBORIST_README_URL) return text((options.numbers ?? [132, 131]).map(n => `${n} | 17 Sept 2026 | [notes](${arboristBlobUrl(path(n))})`).join("\n"));
    if (url.includes("api.github.com")) {
      if (options.api === false) return new Response("Rate limited", { status: 403 });
      return Response.json(url.endsWith("AllArboristCallNotes") ? (options.numbers ?? [132, 131]).map(n => ({ name: path(n).split("/")[1], path: path(n), type: "file", ...(options.sameSha ? { sha: "a".repeat(40) } : {}) })) : []);
    }
    const n = Number(decodeURIComponent(url).match(/Call (\d+)/)?.[1]);
    if (n === options.failNote) return new Response("Temporary error", { status: 503 });
    return text(markdown(n));
  });
}

describe("Arborist recovery collector", () => {
  it("serves the bundled archive immediately while a coalesced refresh is blocked", async () => {
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    const upstream = fetchFixture(), fetcher: typeof fetch = async (url, init) => { await gate; return upstream(url, init); };
    const loader = createArboristLoader({ snapshot: snapshot(), fetcher, now: () => at });
    expect((await loader.getCalls()).map(row => row.date)).toEqual(["2026-10-01", "2026-09-17", "2026-09-03"]);
    await loader.getCalls(); expect(loader.getStatus().refreshing).toBe(true); release(); await loader.refresh();
    expect(upstream.mock.calls.filter(([url]) => String(url).includes("api.github.com"))).toHaveLength(3);
  });
  it("uses official English channel HTML after Atom404 and does not leak GitHub auth", async () => {
    const fetcher = fetchFixture(), loader = createArboristLoader({ fetcher, now: () => at, token: () => "test-token-not-real" });
    const calls = await loader.refresh();
    expect(calls[0]).toMatchObject({ date: "2026-10-01", number: null, source: "youtube" });
    expect(loader.getStatus()).toMatchObject({ notes: { status: "live", transport: "github-api" }, recordings: { status: "live", transport: "youtube-page" } });
    for (const [url, init] of fetcher.mock.calls) {
      expect(init).toMatchObject({ redirect: "error", credentials: "omit", signal: expect.any(AbortSignal) });
      expect(new Headers(init?.headers).get("authorization")).toBe(String(url).startsWith("https://api.github.com/") ? "Bearer test-token-not-real" : null);
    }
    expect(new Headers(fetcher.mock.calls.find(([url]) => url === ARBORIST_YOUTUBE_PAGE)?.[1]?.headers).get("accept-language")).toBe("en-US,en;q=0.9");
  });
  it("discovers explicit raw note paths when the Contents API fails", async () => {
    const loader = createArboristLoader({ fetcher: fetchFixture({ api: false }), now: () => at });
    expect(await loader.refresh()).toHaveLength(3);
    expect(loader.getStatus().notes).toMatchObject({ status: "live", transport: "readme" });
  });
  it("retains notes AND provisional recordings through total failure without renewing success", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    const loader = createArboristLoader({ snapshot: snapshot(), fetcher, now: () => at });
    const calls = await loader.refresh();
    expect(calls).toHaveLength(3); expect(calls[0].videoId).toBe("gJA1brRxnf4");
    expect(loader.getStatus()).toMatchObject({ lastSuccessAt: old, lastAttemptAt: new Date(at).toISOString(), notes: { status: "cached", lastSuccessAt: old }, recordings: { status: "cached", lastSuccessAt: old } });
  });
  it("keeps failed note records when other files refresh and reports partial source health", async () => {
    const loader = createArboristLoader({ snapshot: snapshot(), fetcher: fetchFixture({ failNote: 132 }), now: () => at });
    const calls = await loader.refresh();
    expect(calls.map(row => row.number)).toEqual([null, 132, 131]);
    expect(calls.find(row => row.number === 132)?.agenda).toEqual(["Source agenda"]);
    expect(loader.getStatus()).toMatchObject({ lastSuccessAt: old, notes: { status: "cached", lastSuccessAt: old }, recordings: { status: "live" } });
  });
  it("does not delete recordings when the rolling Atom feed no longer includes them", async () => {
    const loader = createArboristLoader({ snapshot: snapshot(), fetcher: fetchFixture({ feed: true }), now: () => at });
    expect((await loader.refresh())[0].videoId).toBe("gJA1brRxnf4");
    expect(loader.getStatus().recordings).toMatchObject({ status: "live", transport: "youtube-feed" });
  });
  it("replaces a recording-only entry once a numbered official note actually arrives", async () => {
    const loader = createArboristLoader({ snapshot: snapshot(), fetcher: fetchFixture({ numbers: [133, 132, 131] }), now: () => at });
    const calls = await loader.refresh();
    expect(calls).toHaveLength(3); expect(calls[0]).toMatchObject({ number: 133, source: "notes", videoId: "gJA1brRxnf4" });
  });
  it("enriches an unchanged note's missing date from explicit README metadata only", async () => {
    const initial = snapshot([95]); initial.notes[0].call.date = null; initial.notes[0].call.rawDate = "February 6th, 15:00 UTC";
    const fixture = fetchFixture({ numbers: [95], sameSha: true });
    const fetcher = vi.fn<typeof fetch>().mockImplementation((url, init) => url === ARBORIST_README_URL
      ? Promise.resolve(text(`95 | 06 Feb 2025 | [notes](${arboristBlobUrl(path(95))})`)) : fixture(url, init));
    const loader = createArboristLoader({ snapshot: initial, fetcher, now: () => at });
    expect((await loader.refresh()).find(row => row.number === 95)).toMatchObject({ date: "2025-02-06", dateSource: ARBORIST_README_URL, rawDate: "February 6th, 15:00 UTC" });
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("raw.githubusercontent.com") && url !== ARBORIST_README_URL)).toBe(false);
  });
  it("backs off after outages and honors the normal successful refresh interval", async () => {
    let clock = at; const fetcher = fetchFixture();
    const loader = createArboristLoader({ snapshot: snapshot(), fetcher, now: () => clock });
    await loader.refresh(); const count = fetcher.mock.calls.length;
    clock += ARBORIST_REFRESH_MS - 1; await loader.getCalls(); expect(fetcher).toHaveBeenCalledTimes(count);
    clock += 1; await loader.getCalls(); await loader.refresh(); expect(fetcher.mock.calls.length).toBeGreaterThan(count);
  });
  it("rejects oversized/wrong-type video pages without losing bundled data", async () => {
    const loader = createArboristLoader({ snapshot: snapshot(), now: () => at, fetcher: async input => input === ARBORIST_YOUTUBE_PAGE
      ? new Response("small", { headers: { "content-type": "text/html", "content-length": String(4 * 1024 * 1024) } }) : new Response("failure", { status: 503 }) });
    expect(await loader.refresh()).toHaveLength(3); expect(loader.getStatus().recordings.status).toBe("cached");
  });
});
