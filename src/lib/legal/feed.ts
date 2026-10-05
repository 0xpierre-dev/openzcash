import "server-only";
import { LEGAL_ITEMS, LEGAL_SOURCES } from "./curated";
import { BCB_NOTES_URL, parseBcbNotes } from "./bcb-parser";
import { legalSourceUrl, mergeLegalItems, parsePgpHomepage, PGP_PUBLIC_URL } from "./pgp-parser";
import type { LegalFeed, LegalItem, LegalSource } from "./types";

export const LEGAL_REFRESH_MS = 60 * 60_000;
export const LEGAL_FETCH_TIMEOUT_MS = 7_000;
export const LEGAL_MAX_HTML_BYTES = 512 * 1024;
export const PGP_SOURCE: LegalSource = {
  id: "pgp", name: "Pretty Good Policy for Zcash", url: PGP_PUBLIC_URL,
  role: "Advocacy & analysis", mode: "live",
};
export const BCB_SOURCE: LegalSource = {
  id: "bcb", name: "Banco Central do Brasil", url: "https://www.bcb.gov.br/",
  role: "Primary authority", mode: "live",
};
const FEEDS = [
  { source: PGP_SOURCE, url: PGP_PUBLIC_URL, mediaType: /^(?:text\/html|application\/xhtml\+xml)\b/i, parse: parsePgpHomepage },
  { source: BCB_SOURCE, url: BCB_NOTES_URL, mediaType: /^(?:application\/(?:atom\+xml|xml)|text\/xml)\b/i, parse: parseBcbNotes },
];

async function boundedText(response: Response, mediaType: RegExp): Promise<string> {
  if (!response.ok || !response.body ||
      Number(response.headers.get("content-length")) > LEGAL_MAX_HTML_BYTES ||
      !mediaType.test(response.headers.get("content-type") ?? "")) {
    await response.body?.cancel().catch(() => {});
    throw new Error("LEGAL_PUBLIC_RESPONSE_UNAVAILABLE");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let length = 0, text = "";
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > LEGAL_MAX_HTML_BYTES) throw new Error("LEGAL_PUBLIC_RESPONSE_TOO_LARGE");
      text += decoder.decode(part.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

type Dependencies = {
  fetcher?: typeof fetch;
  now?: () => number;
  items: readonly LegalItem[];
  sources: readonly LegalSource[];
};

/** Separate cache instances make timeout, outage and coalescing behavior testable. */
export function createLegalFeedLoader({ fetcher = fetch, now = Date.now, items, sources }: Dependencies) {
  let cache: { attemptedAt: number; value: LegalFeed } | null = null;
  let inflight: Promise<LegalFeed> | null = null;
  const lastSuccess = new Map<string, { items: LegalItem[]; at: string }>();
  const sourceList = [...new Map([...sources, ...FEEDS.map(feed => feed.source)]
    .filter(source => legalSourceUrl(source.url))
    .map(source => [source.id, source])).values()];
  const sourceIds = new Set(sourceList.map(source => source.id));

  async function refresh(startedAt: number): Promise<LegalFeed> {
    const asOf = new Date(startedAt).toISOString().slice(0, 10);
    const sourceHealth = await Promise.all(FEEDS.map(async feed => {
      let status: LegalFeed["pgpStatus"] = "unavailable";
      try {
        // Fixed allowlist: no visitor URLs, credentials, archive probing,
        // redirects or member-only article requests are accepted here.
        const response = await fetcher(feed.url, {
          headers: { accept: "text/html, application/atom+xml, application/xml", "user-agent": "OpenZcash legal public-source reader" },
          signal: AbortSignal.timeout(LEGAL_FETCH_TIMEOUT_MS),
          cache: "no-store", redirect: "error", credentials: "omit",
        });
        const parsed = feed.parse(await boundedText(response, feed.mediaType), asOf);
        lastSuccess.set(feed.source.id, { items: parsed, at: new Date(now()).toISOString() });
        status = "live";
      } catch {
        status = lastSuccess.has(feed.source.id) ? "cached" : "unavailable";
      }
      return { sourceId: feed.source.id, status, fetchedAt: new Date(now()).toISOString(), lastSuccessAt: lastSuccess.get(feed.source.id)?.at ?? null };
    }));
    const pgpHealth = sourceHealth.find(health => health.sourceId === "pgp")!;
    const value: LegalFeed = {
      items: mergeLegalItems(items, [...lastSuccess.values()].flatMap(success => success.items), asOf).filter(item => sourceIds.has(item.sourceId)),
      sources: sourceList,
      // Retrieval attempt time is not a publication/review date. The last
      // successful parse remains separately dated through an outage.
      fetchedAt: new Date(now()).toISOString(), pgpStatus: pgpHealth.status,
      pgpLastSuccessAt: pgpHealth.lastSuccessAt, sourceHealth,
    };
    cache = { attemptedAt: startedAt, value };
    return value;
  }

  return async function getFeed(): Promise<LegalFeed> {
    const at = now();
    if (cache && at - cache.attemptedAt < LEGAL_REFRESH_MS) return cache.value;
    if (!inflight) inflight = refresh(at).finally(() => { inflight = null; });
    return inflight;
  };
}

export const getLegalFeed = createLegalFeedLoader({ items: LEGAL_ITEMS, sources: LEGAL_SOURCES });
