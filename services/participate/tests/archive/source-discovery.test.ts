// @vitest-environment node
import { discoverZcgProposals, discoverZcgUpdates, fetchZcgIssue, fetchZcgSourceEvidence } from "@/lib/archive/source-discovery";
const since = new Date("2026-10-10T10:00:00.000Z"), until = new Date("2026-10-10T11:00:00.000Z");
const candidate = (number = 1) => ({ number, state: "open", updated_at: "2026-10-10T10:20:00.000Z", labels: [{ name: "📋 Grant Application", color: "aabbcc", description: "Preserve me" }, { name: "👀 Ready For ZCG Review" }], body: "# Exact Markdown" });

describe("automatic ZCG discovery", () => {
  it("only includes pending applications in the checkpoint window and preserves full payloads", async () => {
    const valid = candidate();
    const rows = [valid, { ...candidate(2), pull_request: {} }, { ...candidate(3), labels: [...valid.labels, { name: "✅ Grant Approved" }] },
      { ...candidate(4), updated_at: "2026-10-10T09:00:00.000Z" }, { ...candidate(5), updated_at: "2026-10-10T12:00:00.000Z" }, { ...candidate(6), state: "closed" }];
    const fetcher = vi.fn().mockResolvedValue(Response.json(rows));
    expect(await discoverZcgProposals(since, until, fetcher)).toEqual([valid]);
    const url = new URL(String(fetcher.mock.calls[0][0]));
    expect(url.origin).toBe("https://api.github.com");
    expect(url.searchParams.get("since")).toBe(since.toISOString());
    expect(fetcher.mock.calls[0][1].redirect).toBe("error");
  });
  it("paginates, deduplicates overlapping pages, and never follows arbitrary link headers", async () => {
    const first = Array.from({ length: 100 }, (_, i) => candidate(i + 1));
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(first, { headers: { link: '<https://evil.example/secret>; rel="next"' } })).mockResolvedValueOnce(Response.json([candidate(100), candidate(101)]));
    expect(await discoverZcgProposals(since, until, fetcher)).toHaveLength(101);
    expect(new URL(String(fetcher.mock.calls[1][0])).searchParams.get("page")).toBe("2");
    expect(new URL(String(fetcher.mock.calls[1][0])).origin).toBe("https://api.github.com");
  });
  it("fails the whole discovery on a later page error so its cursor cannot skip work", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(Array.from({ length: 100 }, (_, i) => candidate(i + 1)))).mockResolvedValueOnce(new Response(null, { status: 429, headers: { "retry-after": "1800" } }));
    await expect(discoverZcgProposals(since, until, fetcher)).rejects.toMatchObject({ code: "SOURCE_RATE_LIMITED", retryAfterMs: 1_800_000 });
  });
  it("rejects malformed payloads without logging upstream text or tokens", async () => {
    await expect(discoverZcgProposals(since, until, vi.fn().mockResolvedValue(Response.json({ secret: "redacted" })))).rejects.toMatchObject({ code: "SOURCE_INVALID_RESPONSE" });
  });
  it("discovers closed and relabeled updates while excluding PRs and out-of-window data", async () => {
    const closed = { ...candidate(2), state: "closed", labels: [{ name: "✅ Grant Approved" }] };
    const relabeled = { ...candidate(3), labels: [] };
    const fetcher = vi.fn().mockResolvedValue(Response.json([closed, relabeled, { ...candidate(4), pull_request: {} }]));
    expect(await discoverZcgUpdates(since, until, fetcher)).toEqual([closed, relabeled]);
    expect(new URL(String(fetcher.mock.calls[0][0])).searchParams.get("state")).toBe("all");
  });
});

describe("official update evidence", () => {
  const api = "https://api.github.com/repos/ZcashCommunityGrants/zcashcommunitygrants/issues";
  const html = "https://github.com/ZcashCommunityGrants/zcashcommunitygrants/issues/123";
  const event = (id = 1) => ({ id, url: `${api}/events/${id}`, event: "closed", created_at: "2026-10-10T10:00:00.000Z", actor: { id: 99, login: "maintainer" } });
  const comment = { id: 9, url: `${api}/comments/9`, html_url: `${html}#issuecomment-9`, body: "Official repository feedback",
    user: { id: 99, login: "maintainer" }, author_association: "COLLABORATOR", created_at: "2026-10-10T10:00:00.000Z", updated_at: "2026-10-10T10:00:00.000Z" };
  it("fetches fixed-origin evidence serially and retains associated comments without inferring votes", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json([event()]))
      .mockResolvedValueOnce(Response.json([comment, { ...comment, id: 10, author_association: "NONE" }]));
    const result = await fetchZcgSourceEvidence(123, fetcher, "private-token");
    expect(result).toMatchObject({ events: [{ id: 1, event: "closed", label: null }], comments: [{ id: 9, body: comment.body, association: "COLLABORATOR" }] });
    expect(result.comments).toHaveLength(1);
    expect(fetcher.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      "/repos/ZcashCommunityGrants/zcashcommunitygrants/issues/123/events", "/repos/ZcashCommunityGrants/zcashcommunitygrants/issues/123/comments"
    ]);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: "error", cache: "no-store", headers: { Authorization: "Bearer private-token" } });
  });
  it("discards the entire evidence result when a later page fails", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(Array.from({ length: 100 }, (_, i) => event(i + 1))))
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "retry-after": "900" } }));
    await expect(fetchZcgSourceEvidence(123, fetcher)).rejects.toMatchObject({ code: "SOURCE_RATE_LIMITED", retryAfterMs: 900_000 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("rejects inconsistent overlapping pages rather than anchoring a torn snapshot", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(Array.from({ length: 100 }, (_, i) => event(i + 1))))
      .mockResolvedValueOnce(Response.json([{ ...event(100), event: "reopened" }]));
    await expect(fetchZcgSourceEvidence(123, fetcher)).rejects.toMatchObject({ code: "SOURCE_CHANGED_DURING_CAPTURE" });
  });
  it("rejects forged event/comment origins and bounds evidence pagination", async () => {
    const foreign = vi.fn().mockResolvedValueOnce(Response.json([{ ...event(), url: "https://evil.test/events/1" }])).mockResolvedValueOnce(Response.json([]));
    await expect(fetchZcgSourceEvidence(123, foreign)).rejects.toMatchObject({ code: "SOURCE_EVIDENCE_INVALID" });
    const full = vi.fn().mockImplementation(async () => Response.json(Array.from({ length: 100 }, (_, i) => event(i + 1))));
    await expect(fetchZcgSourceEvidence(123, full)).rejects.toMatchObject({ code: "SOURCE_PAGINATION_LIMIT" });
    expect(full).toHaveBeenCalledTimes(10);
  });
  it("fetches one known issue only from the pinned repository and rejects mismatched identity", async () => {
    const full = { ...candidate(123), html_url: html, title: "Official application", user: { login: "applicant" },
      created_at: "2026-10-09T10:00:00.000Z", labels: [{ name: "✅ Grant Approved", color: "034613", description: null }] };
    const fetcher = vi.fn().mockResolvedValue(Response.json(full));
    expect(await fetchZcgIssue(123, fetcher)).toMatchObject({ number: 123, html_url: html });
    expect(String(fetcher.mock.calls[0][0])).toBe(`${api}/123`);
    await expect(fetchZcgIssue(123, vi.fn().mockResolvedValue(Response.json({ ...full, number: 124 })))).rejects.toMatchObject({ code: "SOURCE_INVALID_RESPONSE" });
  });
});
