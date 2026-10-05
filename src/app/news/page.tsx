import Link from "next/link";
import { pageMetadata } from "@/lib/seo/page-metadata";
/* eslint-disable @next/next/no-img-element */
import { Badge, PageHeader } from "@/components/ui";
import { COMMUNITIES } from "@/lib/communities/data";
import {
  getNews,
  newsFetchedAt,
  githubNewsHealth,
  nowMs,
  type NewsItem,
  type NewsSource,
} from "@/lib/news/feed";
import { NewsSeen } from "@/components/news-seen";
import { newsView, NEW_WINDOW_MS, type NewsSearchParams } from "@/lib/news/view";

export const dynamic = "force-dynamic";
export const metadata = pageMetadata({
  title: "News · OpenZcash",
  description:
    "The last seven days across the Zcash ecosystem: community forum, core GitHub releases, ZecHub DAO proposals, grant applications and new ledger entries. Refreshed hourly.",
  path: "/news",
  card: { kicker: "The last seven days across the Zcash ecosystem" },
});


/**
 * Forum handle to community, so a post by a community lead is badged with
 * that community instead of the generic forum mark. Handles are matched
 * case-insensitively against the curated directory.
 */
const BY_HANDLE = new Map(
  COMMUNITIES.filter((c) => c.links.forumUser).map((c) => [
    c.links.forumUser!.toLowerCase(),
    c,
  ]),
);

/** Each source shows its mark, a PNG served locally (strict CSP). Ink glyphs
 * flip to light in the dark theme. */
const SOURCE: Record<NewsSource, { label: string; mark: string; glyph?: boolean }> = {
  forum: { label: "Forum", mark: "/logos/marks/openzcash.png" },
  github: { label: "GitHub", mark: "/logos/marks/github.png", glyph: true },
  sheet: { label: "Spreadsheet", mark: "/logos/marks/sheets.png", glyph: true },
  proposal: { label: "Proposal", mark: "/logos/zcg.png" },
  dao: { label: "ZecHub DAO", mark: "/logos/zechub.png" },
  application: { label: "Application", mark: "/logos/zcg.png" },
};

function rel(ts: string, now: number): string {
  const d = Math.floor((now - Date.parse(ts)) / 86_400_000);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return mo < 12 ? `${mo}mo ago` : `${Math.floor(d / 365)}y ago`;
}

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<NewsSearchParams>;
}) {
  const params = await searchParams;
  const items = await getNews();
  const now = nowMs();
  const { source, query, shown, counts, totalCount, newCount } = newsView(items, params, now);
  const githubHealth = githubNewsHealth();
  const githubUnavailable = githubHealth.filter((source) =>
    source.status === "cached" || source.status === "unavailable",
  );
  const showGithubWarning = githubUnavailable.length > 0 && (!source || source === "github");
  const latest = items[0]?.ts ?? "";
  const newCut = now - NEW_WINDOW_MS;
  const fetchedAt = newsFetchedAt();
  const mins = fetchedAt ? Math.floor((now - fetchedAt) / 60_000) : null;
  const fetchedAgo = mins == null ? "" : mins < 1 ? "just now" : `${mins}m ago`;
  const q = query ? `&q=${encodeURIComponent(query)}` : "";

  return (
    <>
      <NewsSeen latest={latest} />
      <PageHeader
        title="News"
        subtitle="The last seven days across the Zcash ecosystem: community forum, core GitHub releases, ZecHub DAO proposals, grant applications and new ledger entries. Refreshed hourly."
        actions={
          newCount > 0 ? <Badge tone="rose">{newCount} new</Badge> : undefined
        }
      />

      <nav className="ws-pipeline" aria-label="News sources">
        <Link
          href={query ? `/news?q=${encodeURIComponent(query)}` : "/news"}
          aria-current={!source ? "page" : undefined}
        >
          <span>All sources</span>
          <strong>{totalCount}</strong>
        </Link>
        {Object.entries(SOURCE).map(([key, s]) => (
          <Link
            key={key}
            href={`/news?source=${key}${q}`}
            aria-current={source === key ? "page" : undefined}
          >
            <span>{s.label}</span>
            <strong>{counts[key as NewsSource]}</strong>
          </Link>
        ))}
      </nav>

      <form
        key={JSON.stringify([query, source ?? ""])}
        className="ws-news-search"
        role="search"
      >
        <input
          name="q"
          type="search"
          aria-label="Search news"
          placeholder="Search this week's updates…"
          defaultValue={query}
        />
        {source ? (
          <input type="hidden" name="source" value={source} />
        ) : null}
        <button className="ws-button">Search</button>
        {query ? (
          <Link href={source ? `/news?source=${source}` : "/news"}>
            Clear
          </Link>
        ) : null}
      </form>

      <p className="ws-news-meta">
        {shown.length === totalCount
          ? `${totalCount} updates`
          : `${shown.length} of ${totalCount} updates`}
        {" · "}
        {newCount} new in 48 hours · last 7 days
        {fetchedAgo ? ` · feed checked ${fetchedAgo}` : ""}. Older entries stay on
        their own pages.
      </p>

      {showGithubWarning ? (
        <p role="status" className="mb-5 rounded-xl border border-amber-300/50 bg-amber-500/5 px-4 py-3 text-sm text-stone-700">
          GitHub updates are incomplete: {githubUnavailable.length} of {githubHealth.length} repositories
          could not be refreshed. Previously verified releases are kept within the seven-day window.
          {" "}<Link href="/development" className="text-amber-700 underline underline-offset-4">Browse development activity ↗</Link>
        </p>
      ) : null}

      <div className="ws-news-list">
        {shown.length === 0 ? (
          <p className="ws-news-empty">
            {source === "github" && githubUnavailable.length > 0
              ? "No recent releases could be verified for this view. Try again shortly or browse development activity."
              : items.length === 0
              ? "No recent activity. Sources may be momentarily unreachable."
              : "No updates match this view. Clear the filters or revisit the source later."}
          </p>
        ) : null}
        {shown.map((i: NewsItem) => {
          const s = SOURCE[i.source];
          const community = i.author
            ? BY_HANDLE.get(i.author.toLowerCase())
            : undefined;
          const isNew = Date.parse(i.ts) > newCut;
          const external = i.url.startsWith("http");
          const kind = community
            ? community.name
            : i.source === "proposal" || i.source === "github"
              ? (i.kind ?? s.label)
              : (i.kind ?? "");
          return (
            <a
              key={i.id}
              href={i.url}
              target={external ? "_blank" : undefined}
              rel={external ? "noreferrer" : undefined}
              className="ws-news-row"
            >
              {community ? (
                <span className="ws-news-flag" title={community.name}>
                  {community.flag}
                </span>
              ) : (
                <img
                  src={s.mark}
                  alt=""
                  width={16}
                  height={16}
                  className={s.glyph ? "ws-news-mark ws-news-mark-glyph" : "ws-news-mark"}
                />
              )}
              <span className="ws-news-title">
                <span>{i.title}</span>
                {isNew ? <i className="ws-news-new" aria-label="new" /> : null}
              </span>
              <span className="ws-news-kind">{kind}</span>
              <span className="ws-news-source">{s.label}</span>
              <span className="ws-news-date tnum">{rel(i.ts, now)}</span>
            </a>
          );
        })}
      </div>
    </>
  );
}
