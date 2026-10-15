import "server-only";
import { LEGAL_ITEMS, LEGAL_SOURCES } from "./curated";
import { AAIP_NEWS_URL, URCDP_NEWS_URL, LATAM_SOURCES, parseAaipNews, parseUrcdpNews } from "./public-sources";
import { BCB_NOTES_URL, parseBcbNotes } from "./bcb-parser";
import { legalSourceUrl, mergeLegalItems, parsePgpArchive, PGP_PUBLIC_URL } from "./pgp-parser";
import type { LegalFeed, LegalItem, LegalSource } from "./types";
import { LEGAL_SOURCE_IDS, type LegalArchiveSource, type LegalSourceId } from "./archive";

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
const HTML_MEDIA = /^(?:text\/html|application\/xhtml\+xml)\b/i;
const FEEDS = [
  { source: PGP_SOURCE, url: PGP_PUBLIC_URL, mediaType: /^(?:text\/html|application\/xhtml\+xml)\b/i, parse: parsePgpArchive },
  { source: BCB_SOURCE, url: BCB_NOTES_URL, mediaType: /^(?:application\/(?:atom\+xml|xml)|text\/xml)\b/i, parse: parseBcbNotes },
  { source: LATAM_SOURCES[0], url: AAIP_NEWS_URL, mediaType: HTML_MEDIA, parse: parseAaipNews },
  { source: LATAM_SOURCES[1], url: URCDP_NEWS_URL, mediaType: HTML_MEDIA, parse: parseUrcdpNews },
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

export async function fetchLegalSource(sourceId: LegalSourceId, asOf: string, fetcher = fetch): Promise<LegalItem[]> {
  const feed = FEEDS.find(candidate => candidate.source.id === sourceId);
  if (!feed) throw new Error("LEGAL_SOURCE_NOT_ALLOWED");
  const response = await fetcher(feed.url, {
    headers: { accept: "text/html, application/atom+xml, application/xml", "user-agent": "OpenZcash legal public-source reader" },
    signal: AbortSignal.timeout(LEGAL_FETCH_TIMEOUT_MS),
    cache: "no-store", redirect: "error", credentials: "omit",
  });
  return feed.parse(await boundedText(response, feed.mediaType), asOf);
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
        const parsed = await fetchLegalSource(feed.source.id as LegalSourceId, asOf, fetcher);
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

type ArchiveReader = () => Promise<{ available: boolean; rows: LegalArchiveSource[] }>;

/** Reads do not scrape. A daily collector retains items beyond the publisher's rolling feed. */
export function createArchivedLegalFeedLoader({ read, items, sources, now = Date.now }: {
  read: ArchiveReader; items: readonly LegalItem[]; sources: readonly LegalSource[]; now?: () => number;
}) {
  let lastRead: { at: string; rows: LegalArchiveSource[] } | null = null;
  return async (): Promise<LegalFeed> => {
    const at = new Date(now()).toISOString();
    let result: Awaited<ReturnType<ArchiveReader>>;
    try { result = await read(); } catch { result = { available: false, rows: [] }; }
    if (result.available) lastRead = { at, rows: result.rows };
    const rows = result.available ? result.rows : lastRead?.rows ?? [];
    const entries = rows.flatMap(row => row.entries);
    const byUrl = new Map(entries.map(entry => [legalSourceUrl(entry.item.url), entry]));
    const reviewed = items.map(item => {
      const entry = byUrl.get(legalSourceUrl(item.url) ?? "");
      return entry?.changedAt && item.reviewedAt && entry.changedAt.slice(0, 10) >= item.reviewedAt
        ? { ...item, sourceChangedAt: entry.changedAt } : item;
    });
    const sourceHealth = LEGAL_SOURCE_IDS.map(sourceId => {
      const row = rows.find(source => source.sourceId === sourceId);
      const fresh = row?.lastSuccessAt && now() - Date.parse(row.lastSuccessAt) < 26 * 60 * 60_000;
      return { sourceId, status: (result.available && fresh && !row?.errorClass ? "live" : row?.lastSuccessAt ? "cached" : "unavailable") as LegalFeed["pgpStatus"],
        fetchedAt: row?.lastAttemptAt ?? null, lastSuccessAt: row?.lastSuccessAt ?? null };
    });
    const pgp = sourceHealth.find(source => source.sourceId === "pgp")!;
    const latest = (values: Array<string | null>) => values.filter((value): value is string => !!value).sort().at(-1) ?? null;
    return {
      items: mergeLegalItems(reviewed, entries.map(entry => entry.item), at.slice(0, 10)),
      sources: [...new Map([...sources, ...FEEDS.map(feed => feed.source)].map(source => [source.id, source])).values()],
      fetchedAt: latest(sourceHealth.map(source => source.fetchedAt)), pgpStatus: pgp.status,
      pgpLastSuccessAt: pgp.lastSuccessAt, sourceHealth,
      archive: { status: result.available ? "available" : "unavailable", lastReadAt: lastRead?.at ?? null,
        lastCollectedAt: latest(sourceHealth.map(source => source.lastSuccessAt)), itemCount: entries.length, cadence: "daily", timeZone: "America/Sao_Paulo" },
    };
  };
}

export const getLegalFeed = createArchivedLegalFeedLoader({ items: LEGAL_ITEMS, sources: LEGAL_SOURCES,
  read: async () => (await import("./archive-store")).readLegalArchiveSources(),
});
