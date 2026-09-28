import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { FORUM_ROWS, forumContext, forumSearchTerms, forumTopicReference, resetForumCacheForTests, stripHtml } from "./forum";
import { compactData } from "./data";
const cooked = "<p><div class=\"lightbox-wrapper\"><a class=\"lightbox\" href=\"https://cdn.example/x.png\" title=\"Zashi 2.0\"><img src=\"https://cdn.example/x.png\"><div class=\"meta\"><svg></svg><span class=\"filename\">Zashi 2.0</span><span class=\"informations\">1920×768 178 KB</span></div></a></div></p><p>Zashi is turning one &amp; we&#39;re celebrating.</p><ul><li>New design</li><li>Faster sync</li></ul><aside class=\"onebox allowlistedgeneric\"><article>Preview text</article></aside>";
const searchJson = {
  posts: [
    { id: 229726, username: "peacemonger", created_at: "2025-04-28T14:47:46.694Z", blurb: "Zashi 2.0 Zashi is turning one today&hellip;and we&#39;re celebrating with something big.", topic_id: 51030, post_number: 1, like_count: 26 },
    { id: 230590, username: "alice", created_at: "2025-04-29T10:00:00.000Z", blurb: "Same thread, later post", topic_id: 51030, post_number: 4, like_count: 2 },
    { id: 999, username: "ghost", created_at: "2025-04-29T10:00:00.000Z", blurb: "Topic missing from the payload", topic_id: 777, post_number: 1, like_count: 0 },
    { id: 228127, username: "bob", created_at: "2025-03-01T00:00:00.000Z", blurb: "<b>Zashi</b> on Android question", topic_id: 50011, post_number: 1, like_count: 1 },
  ],
  topics: [
    { id: 51030, title: "They Grow Up So Fast: Zashi 2.0", slug: "they-grow-up-so-fast-zashi-2-0", created_at: "2025-04-28T14:47:46.593Z", last_posted_at: "2025-05-02T20:00:34.605Z", posts_count: 6, category_id: 51, closed: false, archived: false },
    { id: 50011, title: "Zashi Android sync", slug: "zashi-android-sync", created_at: "2025-03-01T00:00:00.000Z", last_posted_at: "2025-03-02T00:00:00.000Z", posts_count: 3, category_id: 7, closed: false, archived: false },
  ],
  categories: [{ id: 51, name: "Ecosystem" }],
  grouped_search_result: { more_full_page_results: true },
};
const topicJson = { id: 51030, title: "They Grow Up So Fast: Zashi 2.0", slug: "they-grow-up-so-fast-zashi-2-0", posts_count: 6, created_at: "2025-04-28T14:47:46.593Z", last_posted_at: "2025-05-02T20:00:34.605Z", closed: false, archived: false,
  post_stream: { posts: [
    { username: "peacemonger", created_at: "2025-04-28T14:47:46.694Z", cooked, post_number: 1, post_type: 1 },
    { username: "bob", created_at: "2025-04-28T15:00:00.000Z", cooked: "<p>Congrats!</p>", post_number: 2, post_type: 1 },
    { username: "system", created_at: "2025-04-28T15:01:00.000Z", cooked: "<p>moved</p>", post_number: 3, post_type: 3 },
    { username: "carol", created_at: "2025-04-28T16:00:00.000Z", cooked: `<p>${"long ".repeat(200)}</p>`, post_number: 4, post_type: 1 },
  ] } };
const latestJson = { users: [{ id: 5, username: "dan" }], topic_list: { topics: [{ id: 60001, title: "NU7 timeline", slug: "nu7-timeline", created_at: "2026-09-27T00:00:00.000Z", last_posted_at: "2026-09-28T00:00:00.000Z", posts_count: 9, posters: [{ user_id: 5 }] }] } };
const json = (body: unknown, init: ResponseInit = {}) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });
const fetcher = vi.fn<typeof fetch>();
const signal = () => new AbortController().signal;
beforeEach(() => { resetForumCacheForTests(); fetcher.mockReset(); fetcher.mockImplementation(async (input) => { const url = String(input); if (url.includes("/search.json")) return json(searchJson); if (url.includes("/latest.json")) return json(latestJson); if (/\/t\/\d+\.json$/.test(url)) return json(topicJson); return new Response("nope", { status: 404 }); }); });
describe("forum text and query helpers", () => {
  it("turns cooked HTML into plain text without images, lightbox metadata or link previews", () => {
    const plain = stripHtml(cooked);
    expect(plain).toBe("Zashi is turning one & we're celebrating.\nNew design\nFaster sync");
    expect(plain).not.toMatch(/178 KB|Preview text|lightbox|<|>/);
  });
  it("recognises a thread named by URL or number, even after the question normalizer removed the dots", () => {
    expect(forumTopicReference("What is in https://forum.zcashcommunity.com/t/they-grow-up-so-fast-zashi-2-0/51030?")).toBe(51030);
    expect(forumTopicReference("forumzcashcommunitycom/t/51030")).toBe(51030);
    expect(forumTopicReference("summarize forum topic 51030")).toBe(51030);
    expect(forumTopicReference("What did the forum say about Zashi 2.0?")).toBeNull();
  });
  it("keeps the subject words and drops routing filler in English and Portuguese", () => {
    expect(forumSearchTerms("What did the forum say about the Zashi 2.0 release?")).toBe("zashi 2.0 release");
    expect(forumSearchTerms("O que o fórum disse sobre a Zashi?")).toBe("zashi");
    expect(forumSearchTerms("What's new on the forum?")).toBe("");
    expect(forumSearchTerms(`forum ${"word ".repeat(40)}`).length).toBeLessThanOrEqual(80);
  });
});
describe("forumContext", () => {
  it("searches the question's words, keeps one excerpt per thread in relevance order and reads the category name", async () => {
    const context = await forumContext("What did the forum say about the Zashi 2.0 release?", signal(), fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1); expect(String(fetcher.mock.calls[0][0])).toBe("https://forum.zcashcommunity.com/search.json?q=zashi%202.0%20release");
    expect(context).toMatchObject({ mode: "search", term: "zashi 2.0 release", matched: 2, more: true, forum: "https://forum.zcashcommunity.com" });
    const results = (context as { results: Array<Record<string, unknown>> }).results;
    expect(results.map((r) => r.topicId)).toEqual([51030, 50011]);
    expect(results[0]).toMatchObject({ title: "They Grow Up So Fast: Zashi 2.0", url: "https://forum.zcashcommunity.com/t/they-grow-up-so-fast-zashi-2-0/51030", category: "Ecosystem", author: "peacemonger", postedAt: "2025-04-28T14:47:46.694Z", posts: 6, likes: 26, excerpt: "Zashi 2.0 Zashi is turning one today…and we're celebrating with something big." });
    expect(results[1]).toMatchObject({ category: null, excerpt: "Zashi on Android question" });
    expect(JSON.stringify(context)).not.toContain("Topic missing");
    await forumContext("forum zashi 2.0 release", signal(), fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("reads a named thread: first post in full, early regular replies, the rest counted", async () => {
    const context = await forumContext("Summarize forum topic 51030", signal(), fetcher) as { mode: string; topic: Record<string, unknown> };
    expect(String(fetcher.mock.calls[0][0])).toBe("https://forum.zcashcommunity.com/t/51030.json");
    expect(context.mode).toBe("thread");
    expect(context.topic).toMatchObject({ id: 51030, url: "https://forum.zcashcommunity.com/t/they-grow-up-so-fast-zashi-2-0/51030", posts: 6, closed: false, moreReplies: 3 });
    const first = context.topic.firstPost as { author: string; text: string }; expect(first.author).toBe("peacemonger"); expect(first.text).toBe("Zashi is turning one & we're celebrating.\nNew design\nFaster sync");
    const replies = context.topic.replies as Array<{ author: string; text: string }>;
    expect(replies.map((r) => r.author)).toEqual(["bob", "carol"]); expect(replies[1].text.length).toBeLessThanOrEqual(400); expect(replies[1].text.endsWith("…")).toBe(true);
  });
  it("lists the latest topics when the question names nothing to search", async () => {
    const context = await forumContext("What's new on the forum?", signal(), fetcher) as { mode: string; latestTopics: Array<Record<string, unknown>> };
    expect(String(fetcher.mock.calls[0][0])).toBe("https://forum.zcashcommunity.com/latest.json");
    expect(context.mode).toBe("latest"); expect(context.latestTopics).toEqual([{ topicId: 60001, title: "NU7 timeline", url: "https://forum.zcashcommunity.com/t/nu7-timeline/60001", createdAt: "2026-09-27T00:00:00.000Z", lastPostedAt: "2026-09-28T00:00:00.000Z", posts: 9, author: "dan" }]);
  });
  it("fails closed on an error status, an oversized body or invalid JSON, without caching the failure", async () => {
    fetcher.mockResolvedValueOnce(new Response("busy", { status: 429 }));
    await expect(forumContext("forum zashi", signal(), fetcher)).rejects.toThrow("FORUM_UNAVAILABLE");
    fetcher.mockResolvedValueOnce(json("{}", { headers: { "content-length": "2000000" } }));
    await expect(forumContext("forum zashi", signal(), fetcher)).rejects.toThrow("FORUM_UNAVAILABLE");
    fetcher.mockResolvedValueOnce(json("<html>"));
    await expect(forumContext("forum zashi", signal(), fetcher)).rejects.toThrow();
    await expect(forumContext("forum zashi", signal(), fetcher)).resolves.toMatchObject({ mode: "search" });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("keeps the whole result page inside the forum budget with provenance first", async () => {
    const many = { ...searchJson, posts: Array.from({ length: 30 }, (_, i) => ({ id: i, username: `u${i}`, created_at: "2025-04-28T14:47:46.694Z", blurb: `${"excerpt words ".repeat(18)}${i}`, topic_id: 1000 + i, post_number: 1, like_count: i })), topics: Array.from({ length: 30 }, (_, i) => ({ id: 1000 + i, title: `Thread ${i}`, slug: `thread-${i}`, created_at: "2025-04-28T14:47:46.593Z", last_posted_at: "2025-05-02T20:00:34.605Z", posts_count: 2, category_id: 51 })) };
    fetcher.mockResolvedValueOnce(json(many));
    const context = await forumContext("forum zebra release", signal(), fetcher);
    const compact = compactData(context, "zebra release", 7_000, FORUM_ROWS) as unknown as { data: { results: { shown: unknown[]; totalRows: number }; mode: string; term: string } };
    expect(compact.data.results.shown.length).toBe(FORUM_ROWS); expect(compact.data.mode).toBe("search"); expect(compact.data.term).toBe("zebra release");
    expect(JSON.stringify(compact).length).toBeLessThanOrEqual(7_000);
  });
});
