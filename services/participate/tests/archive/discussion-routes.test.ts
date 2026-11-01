// @vitest-environment node
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), readDiscussion: vi.fn(), mutate: vi.fn(), like: vi.fn(), board: vi.fn(), token: vi.fn() }));
vi.mock("@/lib/auth/pilot-moderation-cookie", () => ({ readPilotModerationToken: mocks.token }));
vi.mock("@/lib/auth/session", () => ({ readSession: mocks.readSession }));
vi.mock("@/lib/services/archive-discussion", () => ({
  readArchiveDiscussion: mocks.readDiscussion, mutateArchiveDiscussion: mocks.mutate, setArchiveProposalLike: mocks.like, readProposalParticipationBoard: mocks.board,
  ArchiveDiscussionError: class extends Error { constructor(public code: string, public status: number) { super(code); } }
}));
import { archiveDiscussionWrite, getArchiveDiscussion, postArchiveLike, getProposalParticipation } from "@/lib/http/archive-discussion";
import { ArchiveDiscussionError } from "@/lib/services/archive-discussion";

const context = { params: Promise.resolve({ communityId: "dao-a", recordId: "record-a", commentId: "comment-a" }) };
const session = { subjectType: "user", userId: "member-a", role: "USER" };
const input = { body: "An independently scoped comment.", requestKey: "079ef03d-d393-4c29-a030-756b135ff79a" };
const request = (body = JSON.stringify(input), origin = "http://localhost:4411") => new NextRequest("http://localhost:4411/api/archives/comments", { method: "POST", headers: { origin, "content-type": "application/json" }, body });

describe("archive discussion HTTP boundary", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.readSession.mockResolvedValue(session); mocks.mutate.mockResolvedValue({ comment: { id: "comment-a" }, participation: { availableCredits: 24 } }); });
  it("rejects foreign-origin writes before reading a session or touching the database", async () => {
    expect((await archiveDiscussionWrite("post")(request(undefined, "https://foreign.test"), context)).status).toBe(403);
    expect(mocks.readSession).not.toHaveBeenCalled(); expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it.each([null, { subjectType: "poll_voter_access", userId: "temporary-voter" }])("requires an account session for protected writes", async value => {
    mocks.readSession.mockResolvedValue(value);
    expect((await archiveDiscussionWrite("post")(request(), context)).status).toBe(401);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it.each(["post", "hide", "reaction"] as const)("passes the signed-in actor and record scope to %s", async action => {
    const result = await archiveDiscussionWrite(action)(request(), context);
    expect(result.status).toBe(action === "post" ? 201 : 200);
    expect(mocks.mutate).toHaveBeenCalledWith("dao-a", "record-a", session, action, input, "comment-a", undefined, true);
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(await result.json()).toMatchObject({ comment: { id: "comment-a" }, participation: { availableCredits: 24 } });
  });
  it("takes moderation authority only from the private cookie", async () => {
    mocks.token.mockResolvedValue("cookie-only-token");
    await archiveDiscussionWrite("hide")(request(), context);
    expect(mocks.mutate).toHaveBeenCalledWith("dao-a", "record-a", session, "hide", input, "comment-a", "cookie-only-token", true);
    await getArchiveDiscussion(request(), context);
    expect(mocks.readDiscussion).toHaveBeenCalledWith("dao-a", "record-a", session, "cookie-only-token", false);
  });
  it("rejects malformed or oversized bodies without trusting content-length", async () => {
    expect((await archiveDiscussionWrite("post")(request("{"), context)).status).toBe(400);
    expect((await archiveDiscussionWrite("post")(request(JSON.stringify({ body: "x".repeat(20001) })), context)).status).toBe(413);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("returns safe failures and preserves authorization and retry status", async () => {
    mocks.mutate.mockRejectedValue(new Error("private-database-details"));
    const result = await archiveDiscussionWrite("post")(request(), context);
    expect(result.status).toBe(500); expect(await result.json()).toEqual({ error: "DISCUSSION_REQUEST_FAILED" });
    mocks.mutate.mockRejectedValue(new ArchiveDiscussionError("COMMENT_RATE_LIMIT", 429));
    expect((await archiveDiscussionWrite("post")(request(), context)).status).toBe(429);
  });
  it("keeps guest reading public and uncached without authorizing writes", async () => {
    mocks.readSession.mockResolvedValue(null);
    mocks.readDiscussion.mockResolvedValue({ comments: [], capabilities: { canPost: false } });
    const result = await getArchiveDiscussion(request(), context);
    expect(mocks.readDiscussion).toHaveBeenCalledWith("dao-a", "record-a", null, undefined, false);
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(await result.json()).toMatchObject({ capabilities: { canPost: false } });
  });
});


describe("public proposal economy routes", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.readSession.mockResolvedValue(session); });
  it("checks origins and permanent accounts before accepting a proposal like", async () => {
    expect((await postArchiveLike(request(undefined, "https://foreign.test"), context)).status).toBe(403);
    expect(mocks.readSession).not.toHaveBeenCalled();
    mocks.readSession.mockResolvedValue(null);
    expect((await postArchiveLike(request(), context)).status).toBe(401);
    expect(mocks.like).not.toHaveBeenCalled();
  });
  it("passes only the authenticated identity and scoped route to the transaction", async () => {
    const action = { liked: true, requestKey: input.requestKey, policyVersion: 2 };
    mocks.like.mockResolvedValue({ proposal: { likes: 1 }, participation: { availableCredits: 24 } });
    const result = await postArchiveLike(request(JSON.stringify(action)), context);
    expect(mocks.like).toHaveBeenCalledWith("dao-a", "record-a", session, action);
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(await result.json()).toMatchObject({ participation: { availableCredits: 24 } });
  });
  it("returns actionable credit conflicts and keeps balance responses private", async () => {
    const { ParticipationCreditError } = await import("@/lib/services/participation-credits");
    mocks.like.mockRejectedValue(new ParticipationCreditError("Private account detail", 409, "INSUFFICIENT_PARTICIPATION_CREDITS"));
    const failure = await postArchiveLike(request(), context);
    expect(failure.status).toBe(409);
    expect(await failure.json()).toEqual({ error: "INSUFFICIENT_PARTICIPATION_CREDITS" });
    mocks.readSession.mockResolvedValue(null); mocks.board.mockResolvedValue({ proposals: [{ recordId: "record-a" }], participation: { availableCredits: null } });
    const read = await getProposalParticipation(request(), context);
    expect(mocks.board).toHaveBeenCalledWith("dao-a", null);
    expect(read.headers.get("cache-control")).toBe("private, no-store");
  });
});
