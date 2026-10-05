import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createLegalFeedLoader as createLoader, LEGAL_MAX_HTML_BYTES, LEGAL_REFRESH_MS } from "./feed";
import { PGP_PUBLIC_URL } from "./pgp-parser";
import { BCB_NOTES_URL } from "./bcb-parser";
import type { LegalItem, LegalSource } from "./types";

const record = { slug: "2026-09-28-weekly-policy-memo", portalPath: "/updates/2026-09-28-weekly-policy-memo", title: "Weekly Policy Memo", summary: "CFTC public policy update.", publishedAt: "2026-09-28", categoryLabel: "Weekly Policy Memo" };
const html = (records: unknown[] = [record]) => `<script>self.__next_f.push(${JSON.stringify([1, `0:${JSON.stringify({ featuredPolicyUpdates: records })}`])})</script>`;
const response = (body = html(), headers: HeadersInit = {}) => new Response(body, { headers: { "content-type": "text/html; charset=utf-8", ...headers } });
const source: LegalSource = { id: "authority", name: "Public authority", url: "https://authority.example/", role: "Primary authority", mode: "curated" };
const seed: LegalItem = { id: "seed", title: "Reviewed item", summary: "Primary source remains available during a feed outage.", url: "https://authority.example/record", sourceId: "authority", publishedAt: "2026-09-02", reviewedAt: "2026-10-01", regions: ["global"], jurisdictions: [], topics: ["Privacy"], kind: "Regulation", status: "Adopted", effectiveAt: "2027-07-10" };
const time = Date.parse("2026-10-05T12:00:00Z");
const emptyAtom = () => new Response('<feed xmlns="http://www.w3.org/2005/Atom"/>', { headers: { "content-type": "application/atom+xml" } });
// PGP-specific tests keep the independent BCB source available and empty.
const createLegalFeedLoader = (options: Parameters<typeof createLoader>[0]) => createLoader({ ...options, fetcher: (input, init) => String(input) === BCB_NOTES_URL ? Promise.resolve(emptyAtom()) : options.fetcher!(input, init) });

describe("Legal feed retrieval and source health", () => {
  it("fetches only the public allowlisted homepage with bounded, credential-free requests", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response());
    const load = createLegalFeedLoader({ fetcher, now: () => time, items: [seed], sources: [source] });
    const result = await load();
    expect(fetcher).toHaveBeenCalledWith(PGP_PUBLIC_URL, expect.objectContaining({ redirect: "error", cache: "no-store", credentials: "omit", signal: expect.any(AbortSignal) }));
    expect(result).toMatchObject({ pgpStatus: "live", fetchedAt: "2026-10-05T12:00:00.000Z", pgpLastSuccessAt: "2026-10-05T12:00:00.000Z" });
    expect(result.items.map(item => item.id)).toEqual(["pgp:2026-09-28-weekly-policy-memo", "seed"]);
    expect(result.items[0].publishedAt).toBe("2026-09-28");
    expect(result.sources.map(item => item.id)).toEqual(["authority", "pgp", "bcb"]);
    await load();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("coalesces simultaneous cold requests and retries only once the hourly window expires", async () => {
    let resolve!: (value: Response) => void;
    let now = time;
    const fetcher = vi.fn<typeof fetch>().mockImplementationOnce(() => new Promise(done => { resolve = done; })).mockImplementation(async () => response());
    const load = createLegalFeedLoader({ fetcher, now: () => now, items: [], sources: [] });
    const first = load(), second = load();
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolve(response());
    expect(await first).toEqual(await second);
    now += LEGAL_REFRESH_MS - 1;
    await load(); expect(fetcher).toHaveBeenCalledTimes(1);
    now += 1;
    await load(); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("keeps the last successful preview and original timestamps through an outage", async () => {
    let now = time;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response()).mockRejectedValueOnce(new Error("timeout"));
    const load = createLegalFeedLoader({ fetcher, now: () => now, items: [seed], sources: [source] });
    const before = await load();
    now += LEGAL_REFRESH_MS;
    const failed = await load();
    expect(failed.pgpStatus).toBe("cached");
    expect(failed.pgpLastSuccessAt).toBe(before.pgpLastSuccessAt);
    expect(failed.fetchedAt).not.toBe(before.fetchedAt);
    expect(failed.items).toEqual(before.items);
    await load(); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([
    ["HTTP error", () => new Response("busy", { status: 503 })],
    ["redirect/login shell", () => response("<h1>Sign in</h1>")],
    ["wrong media type", () => new Response(html(), { headers: { "content-type": "application/json" } })],
    ["declared oversized body", () => response(html(), { "content-length": String(LEGAL_MAX_HTML_BYTES + 1) })],
    ["actual oversized body", () => response("x".repeat(LEGAL_MAX_HTML_BYTES + 1))],
  ])("marks %s unavailable without discarding reviewed source records", async (_, makeResponse) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(makeResponse());
    const load = createLegalFeedLoader({ fetcher, now: () => time, items: [seed], sources: [source] });
    expect(await load()).toMatchObject({ pgpStatus: "unavailable", pgpLastSuccessAt: null, items: [seed] });
  });
  it("accepts an explicitly empty public preview list without resurrecting old highlights", async () => {
    let now = time;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response()).mockResolvedValueOnce(response(html([])));
    const load = createLegalFeedLoader({ fetcher, now: () => now, items: [seed], sources: [source] });
    await load(); now += LEGAL_REFRESH_MS;
    const empty = await load();
    expect(empty.pgpStatus).toBe("live");
    expect(empty.items).toEqual([seed]);
  });
  it("does not expose records with no identified safe source", async () => {
    const load = createLegalFeedLoader({ fetcher: vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")), now: () => time, items: [seed], sources: [{ ...source, url: "javascript:alert(1)" }] });
    const result = await load();
    expect(result.items).toEqual([]);
    expect(result.sources.map(value => value.id)).toEqual(["pgp", "bcb"]);
  });
  it("keeps source failures independent and never upgrades cached BCB dates on PGP success", async () => {
    let now = time, failBcb = false;
    const bcb = '<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>BC: ativos virtuais</title><updated>2026-09-23T18:30:57-03:00</updated><link rel="alternate" href="https://www.bcb.gov.br/detalhenoticia/21267/nota"/><content>Atualização sobre ativos virtuais.</content></entry></feed>';
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async input => {
      if (String(input) === PGP_PUBLIC_URL) return response();
      if (failBcb) throw new Error("BCB unavailable");
      return new Response(bcb, { headers: { "content-type": "application/atom+xml" } });
    });
    const load = createLoader({ fetcher, now: () => now, items: [], sources: [] });
    const first = await load();
    expect(first.sourceHealth?.map(health => health.status)).toEqual(["live", "live"]);
    now += LEGAL_REFRESH_MS; failBcb = true;
    const next = await load();
    expect(next.pgpStatus).toBe("live");
    expect(next.sourceHealth?.find(health => health.sourceId === "bcb")).toMatchObject({ status: "cached", lastSuccessAt: first.fetchedAt });
    expect(next.items.find(item => item.sourceId === "bcb")).toMatchObject({ publishedAt: "2026-09-23", dateBasis: "updated", status: "Official update" });
    expect(fetcher.mock.calls.map(call => String(call[0]))).toEqual([PGP_PUBLIC_URL, BCB_NOTES_URL, PGP_PUBLIC_URL, BCB_NOTES_URL]);
  });
  it("prefers reviewed primary-source context over a live excerpt of the same BCB note", async () => {
    const reviewed: LegalItem = { ...seed, id: "reviewed-bcb", sourceId: "bcb", url: "https://www.bcb.gov.br/detalhenoticia/21267/nota", title: "Reviewed English summary" };
    const atom = '<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>BC: ativos virtuais</title><updated>2026-09-23T18:30:57-03:00</updated><link href="https://www.bcb.gov.br/detalhenoticia/21267/nota"/><content>Atualização sobre ativos virtuais.</content></entry></feed>';
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async input => String(input) === BCB_NOTES_URL ? new Response(atom, { headers: { "content-type": "application/atom+xml" } }) : response(html([])));
    const load = createLoader({ fetcher, now: () => time, items: [reviewed], sources: [] });
    expect((await load()).items).toEqual([reviewed]);
  });
});
