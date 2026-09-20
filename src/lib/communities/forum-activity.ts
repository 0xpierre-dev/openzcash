import "server-only";
import type { Community } from "./data";

/**
 * Live forum activity for the tracked community topics.
 *
 * Reads each topic's metadata from the public Discourse JSON API
 * (forum.zcashcommunity.com) and caches ~10 min in-process — the same
 * pattern as the other live feeds (zechub proposals, live-price). The X
 * profiles in the dataset are links only: X has no free read API, so the
 * activity signal here is the forum, where communities post their monthly
 * reports.
 */

const FORUM = "https://forum.zcashcommunity.com";
const TTL_MS = 10 * 60_000;

/** Last upload date for a channel via YouTube's public RSS (no API key). */
async function fetchYoutubeLatest(channelId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
      { signal: AbortSignal.timeout(5_000), cache: "no-store" },
    );
    if (!res.ok) return null;
    const xml = await res.text();
    const m = xml.match(/<published>([^<]+)<\/published>/g);
    if (!m || m.length < 2) return null;
    const first = m[1]?.replace(/<\/?published>/g, "");
    return first ?? null;
  } catch {
    return null;
  }
}

export interface TopicActivity {
  topicId: number;
  communityId: string;
  title: string;
  url: string;
  kind: string;
  /** ISO timestamp of the newest post in the topic. */
  lastPostedAt: string;
  postsCount: number;
  /** Where the signal came from: the forum, a YouTube upload or a Telegram
   *  post. X, Instagram and TikTok have no free read API: links only. */
  source: "forum" | "youtube" | "telegram";
}

/** Newest post date on a public Telegram channel, from its web preview
 *  (t.me/s/<channel>, no API key). Private groups have no preview. */
async function fetchTelegramLatest(url: string): Promise<string | null> {
  const name = url.replace(/^https?:\/\/t\.me\//, "").replace(/^s\//, "").split(/[/?#]/)[0];
  if (!name || name.startsWith("+") || name.startsWith("joinchat")) return null;
  try {
    const res = await fetch(`https://t.me/s/${name}`, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; OpenZcash/1.0)" },
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const html = await res.text();
    const dates = [...html.matchAll(/<time[^>]*datetime="([^"]+)"/g)].map((m) => m[1]);
    if (dates.length === 0) return null;
    return dates.sort().at(-1) ?? null;
  } catch {
    return null;
  }
}

interface DiscourseTopic {
  id?: number;
  title?: string;
  slug?: string;
  last_posted_at?: string;
  posts_count?: number;
}

let cache: { at: number; items: TopicActivity[] } | null = null;
let inflight: Promise<TopicActivity[]> | null = null;

async function fetchTopic(id: number): Promise<DiscourseTopic | null> {
  try {
    const res = await fetch(`${FORUM}/t/${id}.json`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as DiscourseTopic;
  } catch {
    return null;
  }
}

/**
 * Latest activity for every tracked topic across all communities, newest
 * first. Missing/failed topics are simply omitted (the page renders what it
 * has — the forum being briefly down should not blank the directory).
 */
export async function getCommunityActivity(
  communities: Community[],
): Promise<TopicActivity[]> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.items;
  // Single-flight: concurrent visitors on an expired cache share one sweep
  // instead of each firing ~54 forum requests. A stale cache is served
  // immediately while the shared refresh runs (stale-while-revalidate).
  if (inflight) return cache ? cache.items : inflight;
  inflight = (async () => {
    try {
      return await refresh(communities, now);
    } finally {
      inflight = null;
    }
  })();
  return cache ? cache.items : inflight;
}

async function refresh(
  communities: Community[],
  now: number,
): Promise<TopicActivity[]> {

  const wanted = communities.flatMap((c) =>
    c.forumTopics.map((t) => ({ community: c, topic: t })),
  );
  // Discourse rate-limits anonymous bursts, so fetch in staggered chunks and
  // give failures one retry pass instead of firing all ~54 requests at once.
  const one = async ({
    community,
    topic,
  }: (typeof wanted)[number]): Promise<TopicActivity | null> => {
    let d = await fetchTopic(topic.id);
    if (!d) {
      // One retry with backoff: an immediate re-hit doubles the pressure at
      // the exact moment the forum is rate limiting.
      await new Promise((r) => setTimeout(r, 2_000));
      d = await fetchTopic(topic.id);
    }
    if (!d?.last_posted_at) return null;
    return {
      topicId: topic.id,
      communityId: community.id,
      title: d.title ?? topic.title,
      url: `${FORUM}/t/${d.slug ?? "topic"}/${topic.id}`,
      kind: topic.kind,
      lastPostedAt: d.last_posted_at,
      postsCount: d.posts_count ?? 0,
      source: "forum" as const,
    };
  };
  const results: (TopicActivity | null)[] = [];
  const CHUNK = 12;
  for (let i = 0; i < wanted.length; i += CHUNK) {
    results.push(...(await Promise.all(wanted.slice(i, i + CHUNK).map(one))));
    if (i + CHUNK < wanted.length)
      await new Promise((r) => setTimeout(r, 1_200));
  }
  // YouTube uploads count as activity too (public RSS; X and Instagram have
  // no free read API, so those profiles stay links-only).
  const ytResults = await Promise.all(
    communities
      .filter((c) => c.links.youtubeChannelId)
      .map(async (c): Promise<TopicActivity | null> => {
        const at = await fetchYoutubeLatest(c.links.youtubeChannelId!);
        if (!at) return null;
        return {
          topicId: -1,
          communityId: c.id,
          title: "Latest YouTube upload",
          url: c.links.youtube ?? `https://www.youtube.com/channel/${c.links.youtubeChannelId}`,
          kind: "video",
          lastPostedAt: at,
          postsCount: 0,
          source: "youtube" as const,
        };
      }),
  );
  results.push(...ytResults);
  // Telegram public channels expose their newest posts on the web preview.
  const tgResults = await Promise.all(
    communities
      .filter((c) => c.links.telegram)
      .map(async (c): Promise<TopicActivity | null> => {
        const at = await fetchTelegramLatest(c.links.telegram!);
        if (!at) return null;
        return {
          topicId: -2,
          communityId: c.id,
          title: "Latest Telegram post",
          url: c.links.telegram!,
          kind: "post",
          lastPostedAt: at,
          postsCount: 0,
          source: "telegram" as const,
        };
      }),
  );
  results.push(...tgResults);
  const items = results
    .filter((x): x is TopicActivity => x !== null)
    .sort((a, b) => b.lastPostedAt.localeCompare(a.lastPostedAt));
  if (items.length > 0) cache = { at: now, items };
  return items;
}
