import type { LegalItem, LegalRegion } from "./types";

export const PGP_PUBLIC_URL = "https://community.pgpz.org/";

/** Publication dates come from the public record, never its URL or fetch time. */
export function validLegalDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function plainText(value: unknown, max: number): string | null {
  if (typeof value !== "string" || value.length > max) return null;
  return value.replace(/\s+/g, " ").trim() || null;
}

/** Read a JSON array while respecting strings; brackets in summaries are text. */
function arrayAt(text: string, start: number): unknown[] | null {
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "[") depth++;
    else if (char === "]" && --depth === 0) {
      try {
        const parsed: unknown = JSON.parse(text.slice(start, i + 1));
        return Array.isArray(parsed) ? parsed : null;
      } catch { return null; }
    }
  }
  return null;
}

function featuredRecords(html: string): unknown[] {
  const chunks: string[] = [];
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    const push = script[1].trim().match(/^self\.__next_f\.push\(([\s\S]*)\);?$/);
    if (!push) continue;
    try {
      const payload: unknown = JSON.parse(push[1]);
      if (Array.isArray(payload) && payload[0] === 1 && typeof payload[1] === "string") chunks.push(payload[1]);
    } catch { /* Other scripts are neither executed nor interpreted. */ }
  }
  const data = chunks.join("");
  const key = /"featuredPolicyUpdates"\s*:\s*\[/g;
  const found = key.exec(data);
  const records = found ? arrayAt(data, key.lastIndex - 1) : null;
  if (!records || records.length > 100) throw new Error("PGP_PUBLIC_SCHEMA_UNAVAILABLE");
  return records;
}

function pgpItem(value: unknown, asOf: string): LegalItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const slug = record.slug;
  const title = plainText(record.title, 600), summary = plainText(record.summary, 4_000);
  if (typeof slug !== "string" || !/^[a-z0-9][a-z0-9-]{0,159}$/.test(slug) ||
      record.portalPath !== `/updates/${slug}` || !title || !summary ||
      !validLegalDate(record.publishedAt) || record.publishedAt > asOf) return null;
  // A regional tag needs explicit context in the public preview. Publisher
  // location alone does not establish a memo's jurisdiction.
  const context = `${title} ${summary}`;
  const places: Array<{ pattern: RegExp; region: LegalRegion; jurisdiction: string }> = [
    { pattern: /\b(?:United States|U\.S\b|US Congress|House Financial Services Committee|CFTC|FinCEN|NY DFS|WY DOB)\b/i, region: "north-america", jurisdiction: "United States" },
    { pattern: /\b(?:European Union|European Commission|European Parliament|MiCA)\b/i, region: "europe", jurisdiction: "European Union" },
    { pattern: /\b(?:Brazil|Brazilian|Brasil|Banco Central do Brasil)\b/i, region: "latam", jurisdiction: "Brazil" },
  ];
  const matched = places.filter(place => place.pattern.test(context));
  const regions = [...new Set(matched.map(place => place.region))];
  if (/\b(?:global|worldwide)\b/i.test(context)) regions.push("global");
  const weekly = record.categoryLabel === "Weekly Policy Memo";
  return {
    id: `pgp:${slug}`, title, summary,
    url: new URL(`/updates/${slug}`, PGP_PUBLIC_URL).href,
    sourceId: "pgp", publishedAt: record.publishedAt,
    regions, jurisdictions: matched.map(place => place.jurisdiction),
    topics: ["Policy"], kind: weekly ? "Policy memo" : "Official update",
    status: "Analysis",
    statusDetail: "PGPZ public homepage preview. Advocacy and analysis; the linked full update may require sign-in. Featured items are not the complete archive.",
  };
}

/** Parse only the homepage's confirmed public featured-preview schema. */
export function parsePgpHomepage(html: string, asOf: string): LegalItem[] {
  if (!validLegalDate(asOf)) throw new Error("INVALID_AS_OF_DATE");
  const records = featuredRecords(html);
  const items = records.flatMap(record => {
    const item = pgpItem(record, asOf);
    return item ? [item] : [];
  });
  if (records.length && !items.length) throw new Error("PGP_PUBLIC_RECORDS_UNAVAILABLE");
  return [...new Map(items.map(item => [item.url, item])).values()]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id));
}

/** Canonicalize safe public links for deduplication, preserving document query IDs. */
export function legalSourceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.href;
  } catch { return null; }
}

/** Curated context wins URL duplicates; live-only previews retain their source date. */
export function mergeLegalItems(curated: readonly LegalItem[], live: readonly LegalItem[], asOf: string): LegalItem[] {
  if (!validLegalDate(asOf)) throw new Error("INVALID_AS_OF_DATE");
  const byUrl = new Map<string, LegalItem>();
  const ids = new Set<string>();
  for (const item of [...curated, ...live]) {
    const url = legalSourceUrl(item.url);
    if (!url || !validLegalDate(item.publishedAt) || item.publishedAt > asOf ||
        (item.reviewedAt && (!validLegalDate(item.reviewedAt) || item.reviewedAt > asOf)) ||
        (item.effectiveAt && !validLegalDate(item.effectiveAt)) || byUrl.has(url) || ids.has(item.id)) continue;
    byUrl.set(url, { ...item, url });
    ids.add(item.id);
  }
  return [...byUrl.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id));
}
