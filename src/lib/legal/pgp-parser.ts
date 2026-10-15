import type { LegalItem, LegalRegion } from "./types";
import { attr, elements, excerpt, first, hasClass, htmlText, publicHtml } from "./public-html";

export const PGP_PUBLIC_URL = "https://pgpz.org/updates";

/** Publication dates come from the public record, never its URL or fetch time. */
export function validLegalDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function pgpJurisdictions(context: string) {
  const places: Array<{ pattern: RegExp; region: LegalRegion; jurisdiction: string }> = [
    { pattern: /\b(?:United States|U\.S\b|US Congress|House Financial Services Committee|CFTC|FinCEN|NY DFS|WY DOB)\b/i, region: "north-america", jurisdiction: "United States" },
    { pattern: /\b(?:European Union|European Commission|European Parliament|MiCA)\b/i, region: "europe", jurisdiction: "European Union" },
    { pattern: /\b(?:Brazil|Brazilian|Brasil|Banco Central do Brasil)\b/i, region: "latam", jurisdiction: "Brazil" },
  ];
  const matched = places.filter(place => place.pattern.test(context));
  const regions = [...new Set(matched.map(place => place.region))];
  if (/\b(?:global|worldwide)\b/i.test(context)) regions.push("global");
  return { regions, jurisdictions: matched.map(place => place.jurisdiction) };
}

/** Canonicalize safe public links for deduplication, preserving document query IDs. */
export function legalSourceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (url.hostname === "community.pgpz.org" && !url.port && /^\/updates\/[A-Za-z0-9-]+\/?$/.test(url.pathname)) url.hostname = "pgpz.org";
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

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function archiveDate(label: string): string | null {
  const match = label.match(/^(?:Week of )?([A-Za-z]+) (\d{1,2}), (\d{4})$/);
  if (!match) return null;
  const month = MONTHS.indexOf(match[1]) + 1;
  const value = `${match[3]}-${String(month).padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  return month && validLegalDate(value) ? value : null;
}

/** Public archive introduced in October 2026. Only metadata, never full/member content. */
export function parsePgpArchive(html: string, asOf: string): LegalItem[] {
  if (!validLegalDate(asOf)) throw new Error("INVALID_AS_OF_DATE");
  const root = publicHtml(html);
  const grids = elements(root, node => node.tagName === "div" && hasClass(node, "archive-grid"));
  const cards = grids.flatMap(grid => elements(grid, node => node.tagName === "article" && hasClass(node, "card")));
  if (!grids.length || !cards.length || cards.length > 100) throw new Error("PGP_PUBLIC_SCHEMA_UNAVAILABLE");
  const items: LegalItem[] = [];
  for (const card of cards) {
    const heading = first(card, "h3"), link = heading && first(heading, "a");
    const title = htmlText(heading), label = htmlText(first(card, "p", "eyebrow"));
    const summary = htmlText(elements(card, node => node.tagName === "p" && !hasClass(node, "eyebrow"))[0]);
    const href = link ? attr(link, "href") : "";
    let url: URL;
    try { url = new URL(href, PGP_PUBLIC_URL); } catch { throw new Error("PGP_PUBLIC_RECORD_UNAVAILABLE"); }
    if (url.origin !== "https://pgpz.org" || url.username || url.password || url.search || url.hash || !/^\/updates\/[A-Za-z0-9-]+$/.test(url.pathname) || !title || title.length > 600 || !summary) throw new Error("PGP_PUBLIC_RECORD_UNAVAILABLE");
    const weekly = /^Week of /.test(label);
    // The H1 report exposes a semester, not an exact publication day. It remains
    // available via the public archive; never invent a day or use discovery time.
    if (!weekly && /^H[12] \d{4}\b/.test(label)) continue;
    const date = archiveDate(label);
    if (!date || date > asOf) throw new Error("PGP_PUBLIC_DATE_UNAVAILABLE");
    items.push({ id: `pgp:${url.pathname.split("/").at(-1)}`, title, summary: excerpt(summary), url: url.href, sourceId: "pgp", publishedAt: date,
      dateBasis: weekly ? "reporting-period" : "source-date", ...pgpJurisdictions(`${title} ${summary}`), topics: ["Policy"],
      kind: weekly ? "Policy memo" : "Official update", status: "Analysis",
      statusDetail: weekly ? "PGPZ analysis. Dated by the week covered; the archive does not specify a publication day." : "PGPZ analysis. Date shown by the public archive; not a legal effective date.",
    });
  }
  if (!items.length) throw new Error("PGP_PUBLIC_RECORDS_UNAVAILABLE");
  return mergeLegalItems([], items, asOf);
}
