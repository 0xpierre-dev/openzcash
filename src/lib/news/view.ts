import type { NewsItem, NewsSource } from "./feed";

export const NEWS_SOURCES = ["forum", "github", "sheet", "proposal", "dao", "application"] as const satisfies readonly NewsSource[];
export const NEW_WINDOW_MS = 48 * 60 * 60 * 1000;
export type NewsSearchParams = { source?: string | string[]; q?: string | string[] };

/** A single selection drives the rows, counters and links, including shared URLs. */
export function newsView(items: NewsItem[], params: NewsSearchParams, now: number) {
  const rawSource = Array.isArray(params.source) ? params.source[0] : params.source;
  const source = NEWS_SOURCES.find(value => value === rawSource);
  const query = (Array.isArray(params.q) ? params.q[0] : params.q)?.trim() ?? "";
  const needle = query.toLowerCase();
  const matches = items.filter(item =>
    !needle || `${item.title} ${item.author ?? ""} ${item.kind ?? ""}`.toLowerCase().includes(needle),
  );
  const counts = Object.fromEntries(NEWS_SOURCES.map(value =>
    [value, matches.filter(item => item.source === value).length],
  )) as Record<NewsSource, number>;
  const shown = source ? matches.filter(item => item.source === source) : matches;
  const newCount = shown.filter(item => Date.parse(item.ts) > now - NEW_WINDOW_MS).length;
  return { source, query, shown, counts, totalCount: matches.length, newCount };
}
