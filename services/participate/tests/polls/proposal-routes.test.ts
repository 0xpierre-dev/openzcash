import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { session, readDiscussion, postComment, hideComment, setReaction, createProposal, saveDraft, readDetail, ServiceError, CreditError } = vi.hoisted(() => {
  class ServiceError extends Error {
    constructor(message: string, public status: number, public code: string) { super(message); }
  }
  class CreditError extends Error {
    constructor(public status: number, public code: string) { super(code); }
  }
  return { session: vi.fn(), readDiscussion: vi.fn(), postComment: vi.fn(), hideComment: vi.fn(), setReaction: vi.fn(), createProposal: vi.fn(), saveDraft: vi.fn(), readDetail: vi.fn(), ServiceError, CreditError };
});
vi.mock("@/lib/auth/session", () => ({ readSession: session }));
vi.mock("@/lib/services/proposal-discussion", () => ({
  ProposalDiscussionError: ServiceError, readProposalDiscussion: readDiscussion, postProposalComment: postComment,
  hideProposalComment: hideComment, createCommunityProposal: createProposal, saveCommunityProposalDraft: saveDraft,
  readProposalDetail: readDetail, setProposalCommentReaction: setReaction
}));
vi.mock("@/lib/services/participation-credits", () => ({ ParticipationCreditError: CreditError }));

import { GET as discussionGet, POST as discussionPost } from "@/app/api/polls/[pollId]/comments/route";
import { POST as hidePost } from "@/app/api/polls/[pollId]/comments/[commentId]/hide/route";
import { POST as reactionPost } from "@/app/api/polls/[pollId]/comments/[commentId]/reaction/route";
import { GET as detailGet } from "@/app/api/polls/[pollId]/proposal/route";
import { POST as proposalPost } from "@/app/api/admin/communities/[communityId]/proposals/route";
import { PATCH as proposalPatch } from "@/app/api/admin/communities/[communityId]/proposals/[pollId]/route";

const context = { params: Promise.resolve({ communityId: "community-a", pollId: "poll-a", commentId: "comment-a" }) };
const user = { subjectType: "user", userId: "owner", nick: "Owner", role: "USER" };
function request(method: string, body?: unknown, origin = "http://localhost") {
  return new Request("http://localhost/api/polls/poll-a/comments", {
    method, headers: { origin, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body)
  }) as NextRequest;
}

beforeEach(() => {
  vi.resetAllMocks();
  session.mockResolvedValue(user);
  readDiscussion.mockResolvedValue({ comments: [], capabilities: { canPost: true, canModerate: true } });
  postComment.mockResolvedValue({ id: "comment-a", body: "Hello" });
  hideComment.mockResolvedValue({ id: "comment-a", body: null, hidden: true });
  setReaction.mockResolvedValue({ id: "comment-a", reaction: { count: 1, likedByMe: true, chargedBefore: false } });
  createProposal.mockResolvedValue({ id: "poll-a" });
  saveDraft.mockResolvedValue({ id: "poll-a" });
  readDetail.mockResolvedValue({ id: "poll-a" });
});

describe("private proposal API boundaries", () => {
  it("requires a session for private reads and writes", async () => {
    session.mockResolvedValue(null);
    for (const response of [
      await discussionGet(request("GET"), context), await detailGet(request("GET"), context),
      await discussionPost(request("POST", { body: "Hello" }), context),
      await hidePost(request("POST", { reason: "Spam" }), context),
      await reactionPost(request("POST", { liked: true, requestKey: "like-request-01" }), context),
      await proposalPost(request("POST", {}), context), await proposalPatch(request("PATCH", {}), context)
    ]) expect(response.status).toBe(401);
    expect(readDiscussion).not.toHaveBeenCalled();
    expect(postComment).not.toHaveBeenCalled();
    expect(createProposal).not.toHaveBeenCalled();
    expect(setReaction).not.toHaveBeenCalled();
  });

  it("checks write origins before any session or service operation", async () => {
    for (const response of [
      await discussionPost(request("POST", { body: "Hello" }, "https://foreign.example"), context),
      await hidePost(request("POST", { reason: "Spam" }, "https://foreign.example"), context),
      await reactionPost(request("POST", { liked: true, requestKey: "like-request-01" }, "https://foreign.example"), context),
      await proposalPost(request("POST", {}, "https://foreign.example"), context),
      await proposalPatch(request("PATCH", {}, "https://foreign.example"), context)
    ]) expect(response.status).toBe(403);
    expect(session).not.toHaveBeenCalled();
    expect(postComment).not.toHaveBeenCalled();
    expect(hideComment).not.toHaveBeenCalled();
    expect(createProposal).not.toHaveBeenCalled();
    expect(saveDraft).not.toHaveBeenCalled();
    expect(setReaction).not.toHaveBeenCalled();
  });

  it("serves JSON-safe private responses with no shared caching", async () => {
    const response = await discussionGet(request("GET"), context);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.status).toBe(200);
    expect(readDiscussion).toHaveBeenCalledWith("poll-a", user);
    const detail = await detailGet(request("GET"), context);
    expect(detail.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(detail.json()).resolves.toEqual({ proposal: { id: "poll-a" } });
  });

  it("passes immutable comment and reasoned moderation contracts to authoritative services", async () => {
    const posted = await discussionPost(request("POST", { body: "Hello", parentId: null }), context);
    expect(posted.status).toBe(201);
    expect(postComment).toHaveBeenCalledWith("poll-a", user, { body: "Hello", parentId: null });
    const hidden = await hidePost(request("POST", { reason: "Spam" }), context);
    expect(hideComment).toHaveBeenCalledWith("poll-a", "comment-a", user, { reason: "Spam" });
    await expect(hidden.json()).resolves.toEqual({ comment: { id: "comment-a", body: null, hidden: true } });
  });

  it("passes the explicit idempotent reaction contract with a private response", async () => {
    const input = { liked: true, requestKey: "like-request-001", policyVersion: 3 };
    const response = await reactionPost(request("POST", input), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(setReaction).toHaveBeenCalledWith("poll-a", "comment-a", user, input);
    await expect(response.json()).resolves.toEqual({ comment: { id: "comment-a", reaction: { count: 1, likedByMe: true, chargedBefore: false } } });
  });

  it("maps credit errors without exposing balance or internal details on comment and reaction writes", async () => {
    for (const [status, code] of [[409, "INSUFFICIENT_PARTICIPATION_CREDITS"], [409, "PARTICIPATION_POLICY_CHANGED"], [403, "PARTICIPATION_CREDITS_UNAVAILABLE"]] as const) {
      postComment.mockRejectedValue(new CreditError(status, code));
      setReaction.mockRejectedValue(new CreditError(status, code));
      for (const response of [
        await discussionPost(request("POST", { body: "Hello", requestKey: "comment-key-001", policyVersion: 3 }), context),
        await reactionPost(request("POST", { liked: true, requestKey: "like-key-001", policyVersion: 3 }), context)
      ]) {
        expect(response.status).toBe(status);
        await expect(response.json()).resolves.toEqual({ error: code });
      }
    }
  });

  it("rejects malformed reaction JSON and hides unexpected failures", async () => {
    const malformed = new Request("http://localhost/api/polls/poll-a/comments/comment-a/reaction", { method: "POST", headers: { origin: "http://localhost" }, body: "{" }) as NextRequest;
    const invalid = await reactionPost(malformed, context);
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({ error: "INVALID_REACTION_INPUT" });
    setReaction.mockRejectedValue(new Error("Private accounting details"));
    const failure = await reactionPost(request("POST", { liked: true, requestKey: "like-key-001" }), context);
    expect(failure.status).toBe(500);
    await expect(failure.json()).resolves.toEqual({ error: "REACTION_REQUEST_FAILED" });
  });

  it("rejects temporary participants from draft creation and save routes", async () => {
    session.mockResolvedValue({ subjectType: "poll_voter_access", pollId: "poll-a", pollVoterAccessId: "access-a", userId: "", role: "VOTER_TEMP", nick: "Participant" });
    expect((await proposalPost(request("POST", {}), context)).status).toBe(401);
    expect((await proposalPatch(request("PATCH", {}), context)).status).toBe(401);
    expect(createProposal).not.toHaveBeenCalled();
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it("returns scoped service denials and input errors without leaking internal exceptions", async () => {
    readDiscussion.mockRejectedValue(new ServiceError("Private details", 404, "PROPOSAL_NOT_FOUND"));
    const denied = await discussionGet(request("GET"), context);
    expect(denied.status).toBe(404);
    await expect(denied.json()).resolves.toEqual({ error: "PROPOSAL_NOT_FOUND" });
    postComment.mockRejectedValue(new Error("database credentials must never be returned"));
    const failure = await discussionPost(request("POST", { body: "Hello" }), context);
    expect(failure.status).toBe(500);
    await expect(failure.json()).resolves.toEqual({ error: "DISCUSSION_REQUEST_FAILED" });
    const malformed = new Request("http://localhost/api/polls/poll-a/comments", { method: "POST", headers: { origin: "http://localhost" }, body: "{" }) as NextRequest;
    const invalid = await discussionPost(malformed, context);
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({ error: "INVALID_COMMENT_INPUT" });
  });

  it("creates and saves drafts using the URL community and authenticated database user", async () => {
    const input = { title: "A community proposal", body: "The complete proposal contents", opensAt: "2026-11-01T00:00:00.000Z", closesAt: "2026-11-03T00:00:00.000Z" };
    expect((await proposalPost(request("POST", input), context)).status).toBe(201);
    expect(createProposal).toHaveBeenCalledWith("community-a", "owner", input);
    expect((await proposalPatch(request("PATCH", input), context)).status).toBe(200);
    expect(saveDraft).toHaveBeenCalledWith("community-a", "poll-a", "owner", input);
  });
});
