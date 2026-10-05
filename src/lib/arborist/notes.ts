import "server-only";
import snapshot from "@/data/arborist/snapshot.json";
import { createArboristLoader, type ArboristSnapshot } from "./collector";
import { ARBORIST_FORUM_URL, ARBORIST_REPO_URL, ARBORIST_YOUTUBE_URL } from "./sources";
export { ARBORIST_FORUM_URL, ARBORIST_REPO_URL, ARBORIST_YOUTUBE_URL };
export { parseNote } from "./note-parser";
export type { ArboristCall } from "./feed";
export type { ArboristStatus, ArboristSourceHealth } from "./collector";

// One archive cache across independently bundled Next pages and Zarvis tools.
const state = globalThis as typeof globalThis & { __openZcashArboristV2?: ReturnType<typeof createArboristLoader> };
const loader = state.__openZcashArboristV2 ??= createArboristLoader({
  snapshot: snapshot as ArboristSnapshot, token: () => process.env.GITHUB_TOKEN,
});
export const getArboristCalls = loader.getCalls;
export const getArboristStatus = loader.getStatus;
/** Last complete successful source sweep, never renewed by a failed attempt. */
export const arboristFetchedAt = () => loader.getStatus().lastSuccessAt;

/**
 * Scheduling announcements from the Zcash Foundation forum category.
 *
 * The notes repository only gets a file once a call has happened, so the
 * forum runs ahead of it: "no call this week", "next call on the 23rd",
 * holiday schedules. Those live here, above the archive. (Arborist news also
 * goes out on X, which has no free read API, so the forum is the source.)
 */
export interface ArboristAnnouncement {
  id: number;
  title: string;
  url: string;
  date: string;
}

let annCache: { at: number; items: ArboristAnnouncement[] } | null = null;

export async function getArboristAnnouncements(): Promise<
  ArboristAnnouncement[]
> {
  const now = Date.now();
  if (annCache && now - annCache.at < 30 * 60_000) return annCache.items;
  try {
    const res = await fetch(
      "https://forum.zcashcommunity.com/search.json?q=arborist%20in%3Atitle%20order%3Alatest_topic",
      {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
        cache: "no-store",
      },
    );
    if (!res.ok) return annCache?.items ?? [];
    const j = (await res.json()) as {
      topics?: Array<{ id: number; title: string; slug: string; created_at: string }>;
    };
    // Scheduling news is only useful while it is still true: a "next call on
    // the 23rd" notice from seven weeks ago is archive, not news. Anything
    // older than six weeks is dropped, and the section hides when empty.
    const FRESH_MS = 42 * 86_400_000;
    const cutoff = Date.now() - FRESH_MS;
    const items = (j.topics ?? [])
      .filter((t) => /arborist/i.test(t.title))
      .filter((t) => Date.parse(t.created_at) > cutoff)
      .slice(0, 4)
      .map((t) => ({
        id: t.id,
        title: t.title,
        url: `https://forum.zcashcommunity.com/t/${t.slug}/${t.id}`,
        date: t.created_at.slice(0, 10),
      }));
    if (items.length > 0) annCache = { at: now, items };
    return items;
  } catch {
    return annCache?.items ?? [];
  }
}
