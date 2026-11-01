import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PollComment, PollStatus } from "@prisma/client";
import type { SessionPayload } from "@/lib/auth/guards";

const { tx, getParticipation, debitCredits, CreditError } = vi.hoisted(() => {
  class CreditError extends Error {
    constructor(public status: number, public code: string) { super(code); }
  }
  return { getParticipation: vi.fn(), debitCredits: vi.fn(), CreditError, tx: {
  user: { findFirst: vi.fn() },
  community: { findFirst: vi.fn() },
  communityMembership: { findFirst: vi.fn() },
  communityTreasury: { findFirst: vi.fn() },
  daoMember: { findMany: vi.fn() },
  pollVoterAccess: { findFirst: vi.fn(), updateMany: vi.fn() },
  poll: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  pollComment: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  pollCommentReaction: { groupBy: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
  pollCommentReactionRequest: { findUnique: vi.fn(), create: vi.fn(), count: vi.fn() }
} };
});
vi.mock("@/lib/db", () => ({ db: { $transaction: vi.fn(async (callback) => callback(tx)) } }));
vi.mock("@/lib/services/participation-credits", () => ({
  getParticipationContext: getParticipation, debitParticipationCredits: debitCredits, ParticipationCreditError: CreditError
}));

import {
  createCommunityProposal, readProposalDetail, saveCommunityProposalDraft,
  readProposalDiscussion, postProposalComment, hideProposalComment, setProposalCommentReaction
} from "@/lib/services/proposal-discussion";
import { proposalContentHash, PROPOSAL_CONTENT_HASH_VERSION } from "@/lib/domain/proposal-content";

const manager: SessionPayload = { subjectType: "user", userId: "owner", nick: "forged name", role: "USER" };
const outsider: SessionPayload = { subjectType: "user", userId: "outsider", nick: "Owner", role: "ADMIN" };
const temporary: SessionPayload = { subjectType: "poll_voter_access", userId: "", pollVoterAccessId: "access-a", pollId: "poll-a", nick: "untrusted label", role: "VOTER_TEMP" };
const community = { id: "community-a", name: "Alpha", slug: "alpha" };
const input = { title: "Fund community education", body: "Provide three educational workshops for this community.", opensAt: "2026-11-01T10:00:00.000Z", closesAt: "2026-11-03T10:00:00.000Z" };

function proposal(status: PollStatus = "OPEN") {
  return { id: "poll-a", communityId: community.id as string | null, community, question: input.title, proposalBody: input.body,
    proposalTags: [] as string[],
    status, opensAt: new Date(input.opensAt), closesAt: new Date(input.closesAt), requestedAmountZat: null as bigint | null, requestedAmountUsdCents: null as bigint | null,
    treasury: null as { id: string; kind: "COMMUNITY"; currency: string } | null };
}

function comment(overrides: Partial<PollComment> = {}): PollComment {
  return { id: "comment-a", pollId: "poll-a", parentId: null, authorUserId: "owner", authorPollVoterAccessId: null,
    authorLabel: "Actual owner", body: "A helpful question", createdAt: new Date("2026-10-08T12:00:00.000Z"),
    hiddenAt: null, hiddenByUserId: null, hiddenByLabel: null, hideReason: null, requestKey: null, requestHash: null, ...overrides };
}

const freeParticipation = {
  communityId: "community-a", mode: "FREE", commentCost: 0, reactionCost: 0,
  version: 1, balance: null, sponsored: false, sandbox: false, effectiveCommentCost: 0, effectiveReactionCost: 0
};
const paidParticipation = {
  ...freeParticipation, mode: "CREDITS", commentCost: 2, reactionCost: 1, version: 3,
  balance: 10, sandbox: true, effectiveCommentCost: 2, effectiveReactionCost: 1
};
const payloadHash = (input: Record<string, unknown>) => createHash("sha256").update(JSON.stringify(input)).digest("hex");

beforeEach(() => {
  vi.clearAllMocks();
  tx.user.findFirst.mockResolvedValue({ id: "owner", nick: "Actual owner" });
  tx.community.findFirst.mockResolvedValue(community);
  tx.communityMembership.findFirst.mockResolvedValue({ id: "membership-a" });
  tx.communityTreasury.findFirst.mockResolvedValue({ id: "fund-a" });
  tx.daoMember.findMany.mockResolvedValue([{ nick: "Member", signalUsername: "member.01" }]);
  tx.poll.findFirst.mockResolvedValue(proposal());
  tx.poll.create.mockResolvedValue(proposal("DRAFT"));
  tx.poll.updateMany.mockResolvedValue({ count: 1 });
  tx.pollVoterAccess.findFirst.mockResolvedValue({ id: "access-a", nick: "Actual participant" });
  tx.pollVoterAccess.updateMany.mockResolvedValue({ count: 1 });
  tx.pollComment.findMany.mockResolvedValue([]);
  tx.pollComment.findFirst.mockImplementation(async ({ where }) => where.requestKey ? null : comment());
  tx.pollComment.count.mockResolvedValue(0);
  tx.pollComment.create.mockImplementation(async ({ data }) => comment({ ...data }));
  tx.pollComment.updateMany.mockResolvedValue({ count: 1 });
  tx.pollCommentReaction.groupBy.mockResolvedValue([]);
  tx.pollCommentReaction.findMany.mockResolvedValue([]);
  tx.pollCommentReaction.findUnique.mockResolvedValue(null);
  tx.pollCommentReaction.upsert.mockResolvedValue({});
  tx.pollCommentReactionRequest.findUnique.mockResolvedValue(null);
  tx.pollCommentReactionRequest.create.mockResolvedValue({});
  tx.pollCommentReactionRequest.count.mockResolvedValue(0);
  getParticipation.mockResolvedValue(freeParticipation);
  debitCredits.mockResolvedValue({ replayed: false, balance: 8, operationId: "credit-op" });
});

describe("private proposal access", () => {
  it("shows a membership action to authorized participants and excludes it from the general editor", async () => {
    tx.poll.findFirst.mockResolvedValue({ ...proposal("DRAFT"), membershipAction: { type: "REMOVE_MEMBER", status: "PENDING", nick: "Alice" }, quorumPercent: 55, passingThresholdPercent: 70 });
    const detail = await readProposalDetail("poll-a", manager, community.id);
    expect(detail.canEditDraft).toBe(false);
    expect(detail.membershipChange).toEqual({ type: "REMOVE_MEMBER", status: "PENDING", nick: "Alice" });
    expect(detail.governance).toMatchObject({ quorumPercent: 55, passingThresholdPercent: 70 });
    await expect(saveCommunityProposalDraft(community.id, "poll-a", "owner", input)).rejects.toMatchObject({ status: 409, code: "MEMBERSHIP_PROPOSAL_EDIT_UNSUPPORTED" });
    expect(tx.poll.updateMany).not.toHaveBeenCalled();
    expect(tx.pollVoterAccess.updateMany).not.toHaveBeenCalled();
  });
  it("requires active scoped membership or explicitly assigned published eligibility, even for a global administrator", async () => {
    tx.user.findFirst.mockResolvedValue({ id: "outsider", nick: "Actual outsider" });
    tx.poll.findFirst.mockResolvedValue(null);
    await expect(readProposalDiscussion("poll-a", outsider)).rejects.toMatchObject({ code: "PROPOSAL_NOT_FOUND", status: 404 });
    expect(tx.poll.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      communityId: { not: null }, OR: [
        { community: { is: { kind: "DAO", memberships: { some: { userId: "outsider", status: "ACTIVE", role: { in: ["OWNER", "MANAGER"] }, user: { status: "ACTIVE" } } } } } },
        { status: { notIn: ["DRAFT", "ANCHORING"] }, eligibility: { some: { userId: "outsider", user: { status: "ACTIVE" } } } }
      ]
    }) }));
    expect(tx.pollComment.findMany).not.toHaveBeenCalled();
  });

  it("fails closed for a disabled user despite a valid-looking owner session", async () => {
    tx.user.findFirst.mockResolvedValue(null);
    await expect(postProposalComment("poll-a", manager, { body: "hello" })).rejects.toMatchObject({ code: "PROPOSAL_NOT_FOUND" });
    expect(tx.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "owner", status: "ACTIVE" } }));
    expect(tx.pollComment.create).not.toHaveBeenCalled();
  });

  it("fails closed for unassigned legacy polls and a mismatched requested community", async () => {
    tx.poll.findFirst.mockResolvedValue({ ...proposal(), communityId: null });
    await expect(readProposalDetail("poll-a", manager)).rejects.toMatchObject({ code: "PROPOSAL_NOT_FOUND" });
    tx.poll.findFirst.mockResolvedValue(proposal());
    await expect(readProposalDetail("poll-a", manager, "community-b")).rejects.toMatchObject({ code: "PROPOSAL_NOT_FOUND" });
  });

  it("limits temporary sessions to their exact active unexpired published poll access", async () => {
    await expect(readProposalDiscussion("poll-b", temporary)).rejects.toMatchObject({ code: "PROPOSAL_NOT_FOUND" });
    expect(tx.pollVoterAccess.findFirst).not.toHaveBeenCalled();
    await readProposalDiscussion("poll-a", temporary);
    expect(tx.pollVoterAccess.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: {
      id: "access-a", pollId: "poll-a", status: "ACTIVE", expiresAt: { gt: expect.any(Date) }
    } }));
    expect(tx.poll.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      status: { notIn: ["DRAFT", "ANCHORING"] }, voterAccesses: { some: { id: "access-a", status: "ACTIVE", expiresAt: { gt: expect.any(Date) } } }
    }) }));
    tx.pollVoterAccess.findFirst.mockResolvedValue(null);
    await expect(readProposalDiscussion("poll-a", temporary)).rejects.toMatchObject({ code: "PROPOSAL_NOT_FOUND" });
  });

  it("allows eligible participants to discuss but gives moderation only to live managers", async () => {
    tx.communityMembership.findFirst.mockResolvedValue(null);
    expect((await readProposalDiscussion("poll-a", manager)).capabilities).toEqual({ canPost: true, canModerate: false, canReact: true });
    await expect(hideProposalComment("poll-a", "comment-a", manager, { reason: "spam" })).rejects.toMatchObject({ code: "COMMENT_NOT_FOUND" });
    expect(tx.pollComment.updateMany).not.toHaveBeenCalled();
    expect(tx.communityMembership.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: {
      communityId: "community-a", userId: "owner", status: "ACTIVE", role: { in: ["OWNER", "MANAGER"] }, user: { status: "ACTIVE" }
    } }));
  });
});

describe("immutable participant discussion", () => {
  it("keeps private custom profiles out of discussion responses while retaining the stable nick", async () => {
    tx.pollComment.findMany.mockResolvedValue([{ ...comment(), authorUser: {
      displayName: "Private display name", avatarUrl: "data:image/webp;base64,private-avatar", shareProfileInDiscussion: false, status: "ACTIVE"
    } }]);
    const discussion = await readProposalDiscussion("poll-a", manager);
    expect(discussion.comments[0]).toMatchObject({ authorLabel: "Actual owner", authorNick: "Actual owner", authorAvatarUrl: null });
    expect(JSON.stringify(discussion)).not.toContain("Private display name");
    expect(JSON.stringify(discussion)).not.toContain("private-avatar");
    expect(discussion.comments[0]).not.toHaveProperty("authorUser");
    expect(tx.pollComment.findMany).toHaveBeenCalledWith(expect.objectContaining({ include: {
      authorUser: { select: { displayName: true, avatarUrl: true, shareProfileInDiscussion: true, status: true } }
    } }));
  });

  it("applies the current opt-in to old comments and immediately stops sharing after opt-out", async () => {
    const profile = { displayName: "Community organizer", avatarUrl: "data:image/webp;base64,shared-avatar", shareProfileInDiscussion: true, status: "ACTIVE" };
    tx.pollComment.findMany.mockResolvedValue([{ ...comment(), authorUser: profile }]);
    const shared = (await readProposalDiscussion("poll-a", manager)).comments[0];
    expect(shared).toMatchObject({ authorLabel: "Community organizer", authorNick: "Actual owner", authorAvatarUrl: profile.avatarUrl });
    profile.shareProfileInDiscussion = false;
    const privateAgain = (await readProposalDiscussion("poll-a", manager)).comments[0];
    expect(privateAgain).toMatchObject({ authorLabel: "Actual owner", authorNick: "Actual owner", authorAvatarUrl: null });
  });

  it("does not share a disabled account's custom identity or attach a profile to temporary voters", async () => {
    const profile = { displayName: "Other identity", avatarUrl: "data:image/webp;base64,avatar", shareProfileInDiscussion: true, status: "DISABLED" };
    tx.pollComment.findMany.mockResolvedValue([{ ...comment(), authorUser: profile }]);
    expect((await readProposalDiscussion("poll-a", manager)).comments[0]).toMatchObject({ authorLabel: "Actual owner", authorAvatarUrl: null });
    tx.pollComment.findMany.mockResolvedValue([{ ...comment({ authorUserId: null, authorPollVoterAccessId: "access-a", authorLabel: "Actual participant" }), authorUser: { ...profile, status: "ACTIVE" } }]);
    expect((await readProposalDiscussion("poll-a", temporary)).comments[0]).toMatchObject({ authorLabel: "Actual participant", authorNick: "Actual participant", authorAvatarUrl: null });
  });

  it("freezes the nick on new comments even when an opted-in custom name is returned", async () => {
    tx.pollComment.create.mockImplementation(async ({ data }) => ({ ...comment(data), authorUser: {
      displayName: "Community organizer", avatarUrl: null, shareProfileInDiscussion: true, status: "ACTIVE"
    } }));
    const result = await postProposalComment("poll-a", manager, { body: "New discussion contribution" });
    expect(result).toMatchObject({ authorLabel: "Community organizer", authorNick: "Actual owner", authorAvatarUrl: null });
    expect(tx.pollComment.create.mock.calls[0][0].data.authorLabel).toBe("Actual owner");
  });

  it("preserves hidden-content privacy when returning an opted-in author's profile", async () => {
    tx.pollComment.findFirst.mockResolvedValue({ ...comment(), authorUser: {
      displayName: "Community organizer", avatarUrl: null, shareProfileInDiscussion: true, status: "ACTIVE"
    } });
    const hidden = await hideProposalComment("poll-a", "comment-a", manager, { reason: "Unrelated content" });
    expect(hidden).toMatchObject({ authorLabel: "Community organizer", authorNick: "Actual owner", body: null, hidden: true });
    expect(hidden.moderation?.moderatorLabel).toBe("Actual owner");
  });

  it("stores plain text and a database-derived author label without ballot or credential fields", async () => {
    const result = await postProposalComment("poll-a", manager, { body: " <script>alert(1)</script> " });
    expect(result.body).toBe("<script>alert(1)</script>");
    expect(result.authorLabel).toBe("Actual owner");
    expect(tx.pollComment.create).toHaveBeenCalledWith(expect.objectContaining({ data: { pollId: "poll-a", parentId: null, authorUserId: "owner", authorLabel: "Actual owner", body: "<script>alert(1)</script>" } }));
    expect(result).not.toHaveProperty("authorUserId");
    expect(result).not.toHaveProperty("authorPollVoterAccessId");
  });

  it("records a temporary actor by access ID, never the session nickname", async () => {
    const result = await postProposalComment("poll-a", temporary, { body: "Useful comment" });
    expect(result.authorLabel).toBe("Actual participant");
    expect(tx.pollComment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ authorPollVoterAccessId: "access-a", authorLabel: "Actual participant" }) }));
    expect(tx.pollComment.create.mock.calls[0][0].data).not.toHaveProperty("authorUserId");
  });

  it("rejects foreign-poll parents before any comment write", async () => {
    tx.pollComment.findFirst.mockResolvedValue(null);
    await expect(postProposalComment("poll-a", manager, { body: "Reply", parentId: "foreign-comment" })).rejects.toMatchObject({ code: "PARENT_COMMENT_NOT_FOUND" });
    expect(tx.pollComment.findFirst).toHaveBeenCalledWith({ where: { id: "foreign-comment", pollId: "poll-a" }, select: { id: true, parentId: true, hiddenAt: true } });
    expect(tx.pollComment.create).not.toHaveBeenCalled();
  });

  it("allows replies to replies and preserves their immediate parent", async () => {
    expect((await postProposalComment("poll-a", manager, { body: "Reply", parentId: "comment-a" })).parentId).toBe("comment-a");
    tx.pollComment.findFirst.mockResolvedValue(comment({ parentId: "root-comment", body: "🛡️" }));
    expect((await postProposalComment("poll-a", manager, { body: "Nested reply", parentId: "comment-a" })).parentId).toBe("comment-a");
    expect(tx.pollComment.create).toHaveBeenCalledTimes(2);
    expect(tx.pollComment.create).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ parentId: "comment-a", body: "Nested reply" }) }));
  });

  it.each([{ body: " " }, { body: "a".repeat(4001) }, { body: "Fine", editedAt: "now" }])("rejects invalid comment input %j", async (invalid) => {
    await expect(postProposalComment("poll-a", manager, invalid)).rejects.toMatchObject({ code: "INVALID_COMMENT_INPUT", status: 400 });
    expect(tx.pollComment.create).not.toHaveBeenCalled();
  });

  it("rate limits five comments per actor and proposal in one minute", async () => {
    tx.pollComment.count.mockResolvedValue(5);
    await expect(postProposalComment("poll-a", manager, { body: "Another" })).rejects.toMatchObject({ code: "COMMENT_RATE_LIMIT", status: 429 });
    expect(tx.pollComment.count).toHaveBeenCalledWith({ where: { pollId: "poll-a", authorUserId: "owner", createdAt: { gte: expect.any(Date) } } });
    expect(tx.pollComment.create).not.toHaveBeenCalled();
  });

  it("makes archived discussions read-only for managers and retains existing comments", async () => {
    tx.poll.findFirst.mockResolvedValue(proposal("ARCHIVED"));
    tx.pollComment.findMany.mockResolvedValue([comment()]);
    const discussion = await readProposalDiscussion("poll-a", manager);
    expect(discussion.capabilities).toEqual({ canPost: false, canModerate: false, canReact: false });
    expect(discussion.comments).toHaveLength(1);
    await expect(postProposalComment("poll-a", manager, { body: "Another" })).rejects.toMatchObject({ code: "DISCUSSION_READ_ONLY" });
    await expect(hideProposalComment("poll-a", "comment-a", manager, { reason: "Spam" })).rejects.toMatchObject({ code: "DISCUSSION_READ_ONLY" });
    expect(tx.pollComment.create).not.toHaveBeenCalled();
    expect(tx.pollComment.updateMany).not.toHaveBeenCalled();
  });

  it("requires a moderation reason and hides content while retaining a visible tombstone", async () => {
    await expect(hideProposalComment("poll-a", "comment-a", manager, { reason: " " })).rejects.toMatchObject({ code: "INVALID_MODERATION_INPUT" });
    const result = await hideProposalComment("poll-a", "comment-a", manager, { reason: "Spam unrelated to this proposal" });
    expect(result).toMatchObject({ body: null, hidden: true, moderation: { reason: "Spam unrelated to this proposal", moderatorLabel: "Actual owner" } });
    expect(tx.pollComment.updateMany.mock.calls[0][0].data).not.toHaveProperty("body");
    tx.pollComment.findMany.mockResolvedValue([comment({ hiddenAt: new Date(), hiddenByUserId: "owner", hiddenByLabel: "Actual owner", hideReason: "Spam" })]);
    expect((await readProposalDiscussion("poll-a", manager)).comments[0].body).toBeNull();
  });

  it("scopes moderation to the requested poll and rejects repeated hiding", async () => {
    tx.pollComment.findFirst.mockResolvedValue(null);
    await expect(hideProposalComment("poll-a", "foreign-comment", manager, { reason: "Spam" })).rejects.toMatchObject({ code: "COMMENT_NOT_FOUND" });
    expect(tx.pollComment.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "foreign-comment", pollId: "poll-a" } }));
    tx.pollComment.findFirst.mockResolvedValue(comment({ hiddenAt: new Date() }));
    await expect(hideProposalComment("poll-a", "comment-a", manager, { reason: "Spam" })).rejects.toMatchObject({ code: "COMMENT_ALREADY_HIDDEN" });
    expect(tx.pollComment.updateMany).not.toHaveBeenCalled();
  });
});

describe("idempotent comments and server-priced participation", () => {
  it("returns the original comment before pricing or rate limiting when the same request is retried", async () => {
    const requestKey = "retry-comment-001";
    tx.pollComment.findFirst.mockResolvedValue(comment({ requestKey, requestHash: payloadHash({ pollId: "poll-a", body: "A helpful question", parentId: null }) }));
    tx.pollComment.count.mockResolvedValue(5);
    getParticipation.mockResolvedValue(paidParticipation);
    const result = await postProposalComment("poll-a", manager, { body: " A helpful question ", requestKey, policyVersion: 1 });
    expect(result.id).toBe("comment-a");
    expect(getParticipation).not.toHaveBeenCalled();
    expect(debitCredits).not.toHaveBeenCalled();
    expect(tx.pollComment.count).not.toHaveBeenCalled();
    expect(tx.pollComment.create).not.toHaveBeenCalled();
    expect(tx.pollComment.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { pollId: "poll-a", authorUserId: "owner", requestKey } }));
  });

  it("rejects a reused comment request key with different contents or parent", async () => {
    tx.pollComment.findFirst.mockResolvedValue(comment({ requestKey: "retry-comment-001", requestHash: payloadHash({ pollId: "poll-a", body: "Original", parentId: null }) }));
    for (const input of [{ body: "Changed" }, { body: "Original", parentId: "comment-parent" }]) {
      await expect(postProposalComment("poll-a", manager, { ...input, requestKey: "retry-comment-001" })).rejects.toMatchObject({ code: "COMMENT_IDEMPOTENCY_CONFLICT" });
    }
    expect(debitCredits).not.toHaveBeenCalled();
    expect(tx.pollComment.create).not.toHaveBeenCalled();
  });

  it("debits the server price and creates a keyed comment in the same transaction", async () => {
    getParticipation.mockResolvedValue(paidParticipation);
    const requestKey = "a".repeat(128);
    const result = await postProposalComment("poll-a", manager, { body: "A paid question", requestKey, policyVersion: 3 });
    expect(result.body).toBe("A paid question");
    expect(debitCredits).toHaveBeenCalledWith(tx, expect.objectContaining({
      communityId: "community-a", userId: "owner", kind: "COMMENT", cost: 2, targetId: "poll-a", policyVersion: 3,
      payloadHash: payloadHash({ pollId: "poll-a", body: "A paid question", parentId: null })
    }));
    expect(debitCredits.mock.calls[0][1].requestKey.length).toBeLessThanOrEqual(128);
    expect(tx.pollComment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      requestKey, requestHash: payloadHash({ pollId: "poll-a", body: "A paid question", parentId: null })
    }) }));
    expect(debitCredits.mock.invocationCallOrder[0]).toBeLessThan(tx.pollComment.create.mock.invocationCallOrder[0]);
  });

  it("requires a paid comment key and prevents a write when credit or policy checks fail", async () => {
    getParticipation.mockResolvedValue(paidParticipation);
    await expect(postProposalComment("poll-a", manager, { body: "Paid question", policyVersion: 3 })).rejects.toMatchObject({ code: "COMMENT_REQUEST_KEY_REQUIRED" });
    for (const code of ["INSUFFICIENT_PARTICIPATION_CREDITS", "PARTICIPATION_POLICY_CHANGED", "PARTICIPATION_CREDITS_UNAVAILABLE"]) {
      debitCredits.mockRejectedValue(new CreditError(409, code));
      await expect(postProposalComment("poll-a", manager, { body: "Paid question", requestKey: "paid-question-001", policyVersion: 2 })).rejects.toMatchObject({ code });
    }
    expect(tx.pollComment.create).not.toHaveBeenCalled();
  });

  it("keeps free legacy comments and sponsored invitation comments independent from a persistent credit account", async () => {
    await postProposalComment("poll-a", manager, { body: "Free legacy question" });
    getParticipation.mockResolvedValue({ ...paidParticipation, sponsored: true, balance: null, effectiveCommentCost: 0, effectiveReactionCost: 0 });
    await postProposalComment("poll-a", temporary, { body: "Sponsored question" });
    expect(debitCredits).not.toHaveBeenCalled();
    expect(getParticipation).toHaveBeenLastCalledWith(tx, "community-a", { accessId: "access-a" });
    expect(tx.pollComment.create).toHaveBeenCalledTimes(2);
  });

  it("rejects hidden reply parents and client-supplied prices", async () => {
    tx.pollComment.findFirst.mockResolvedValue(comment({ hiddenAt: new Date() }));
    await expect(postProposalComment("poll-a", manager, { body: "Reply", parentId: "comment-a" })).rejects.toMatchObject({ code: "PARENT_COMMENT_NOT_FOUND" });
    await expect(postProposalComment("poll-a", manager, { body: "Question", cost: 0, requestKey: "price-override" })).rejects.toMatchObject({ code: "INVALID_COMMENT_INPUT" });
    expect(debitCredits).not.toHaveBeenCalled();
    expect(tx.pollComment.create).not.toHaveBeenCalled();
  });
});

describe("private comment reactions", () => {
  it("returns aggregate counts and only the caller's own state and balance", async () => {
    getParticipation.mockResolvedValue(paidParticipation);
    tx.pollComment.findMany.mockResolvedValue([comment()]);
    tx.pollCommentReaction.groupBy.mockResolvedValue([{ commentId: "comment-a", _count: { _all: 4 } }]);
    tx.pollCommentReaction.findMany.mockResolvedValue([{ commentId: "comment-a", active: false, chargedBefore: true }]);
    const discussion = await readProposalDiscussion("poll-a", manager);
    expect(discussion.comments[0].reaction).toEqual({ count: 4, likedByMe: false, chargedBefore: true });
    expect(discussion.policy.participation).toEqual({
      communityId: "community-a", mode: "CREDITS", commentCost: 2, reactionCost: 1,
      version: 3, availableCredits: 10, sponsored: false, sandbox: true, paymentReview: false
    });
    expect(tx.pollCommentReaction.findMany).toHaveBeenCalledWith({
      where: { commentId: { in: ["comment-a"] }, actorKey: "user:owner" }, select: { commentId: true, active: true, chargedBefore: true }
    });
    expect(JSON.stringify(discussion)).not.toContain("actorKey");
    expect(JSON.stringify(discussion)).not.toContain("authorUserId");
  });

  it("records one priced like per actor/comment without touching the ballot", async () => {
    getParticipation.mockResolvedValue(paidParticipation);
    await setProposalCommentReaction("poll-a", "comment-a", manager, { liked: true, requestKey: "like-request-001", policyVersion: 3 });
    expect(debitCredits).toHaveBeenCalledWith(tx, expect.objectContaining({
      communityId: "community-a", userId: "owner", kind: "REACTION", cost: 1,
      requestKey: "reaction:comment-a", targetId: "comment-a", policyVersion: 3
    }));
    expect(tx.pollCommentReaction.upsert).toHaveBeenCalledWith({
      where: { commentId_actorKey: { commentId: "comment-a", actorKey: "user:owner" } },
      create: { pollId: "poll-a", commentId: "comment-a", actorKey: "user:owner", authorUserId: "owner", active: true, chargedBefore: true },
      update: { active: true, chargedBefore: true }
    });
    expect(tx.pollCommentReactionRequest.create).toHaveBeenCalledWith({ data: {
      pollId: "poll-a", commentId: "comment-a", actorKey: "user:owner", requestKey: "like-request-001",
      payloadHash: payloadHash({ pollId: "poll-a", commentId: "comment-a", liked: true }), liked: true
    } });
    expect(tx.poll.updateMany).not.toHaveBeenCalled();
    expect(tx.pollComment.create).not.toHaveBeenCalled();
  });

  it("removes and restores a previously paid like for free even if the policy has changed", async () => {
    tx.pollCommentReaction.findUnique.mockResolvedValue({ active: true, chargedBefore: true });
    await setProposalCommentReaction("poll-a", "comment-a", manager, { liked: false, requestKey: "unlike-request-1" });
    tx.pollCommentReaction.findUnique.mockResolvedValue({ active: false, chargedBefore: true });
    await setProposalCommentReaction("poll-a", "comment-a", manager, { liked: true, requestKey: "restore-request-1", policyVersion: 1 });
    expect(getParticipation).not.toHaveBeenCalled();
    expect(debitCredits).not.toHaveBeenCalled();
    expect(tx.pollCommentReaction.upsert).toHaveBeenNthCalledWith(1, expect.objectContaining({ update: { active: false, chargedBefore: true } }));
    expect(tx.pollCommentReaction.upsert).toHaveBeenNthCalledWith(2, expect.objectContaining({ update: { active: true, chargedBefore: true } }));
  });

  it("does not charge an already active free like when a new request repeats that state", async () => {
    tx.pollCommentReaction.findUnique.mockResolvedValue({ active: true, chargedBefore: false });
    getParticipation.mockResolvedValue(paidParticipation);
    await setProposalCommentReaction("poll-a", "comment-a", manager, { liked: true, requestKey: "repeat-state-001" });
    expect(debitCredits).not.toHaveBeenCalled();
    expect(getParticipation).not.toHaveBeenCalled();
  });

  it("replays an old request without reversing a subsequent toggle or applying another charge", async () => {
    tx.pollCommentReactionRequest.findUnique.mockResolvedValue({ payloadHash: payloadHash({ pollId: "poll-a", commentId: "comment-a", liked: true }) });
    tx.pollCommentReaction.findMany.mockResolvedValue([{ commentId: "comment-a", active: false, chargedBefore: true }]);
    const result = await setProposalCommentReaction("poll-a", "comment-a", manager, { liked: true, requestKey: "old-like-request" });
    expect(result.reaction.likedByMe).toBe(false);
    expect(tx.pollCommentReaction.upsert).not.toHaveBeenCalled();
    expect(tx.pollCommentReactionRequest.create).not.toHaveBeenCalled();
    expect(debitCredits).not.toHaveBeenCalled();
    await expect(setProposalCommentReaction("poll-a", "comment-a", manager, { liked: false, requestKey: "old-like-request" })).rejects.toMatchObject({ code: "REACTION_IDEMPOTENCY_CONFLICT" });
  });

  it("does not persist a reaction/request when balance or policy verification fails", async () => {
    getParticipation.mockResolvedValue(paidParticipation);
    debitCredits.mockRejectedValue(new CreditError(409, "INSUFFICIENT_PARTICIPATION_CREDITS"));
    await expect(setProposalCommentReaction("poll-a", "comment-a", manager, { liked: true, requestKey: "unfunded-like-01", policyVersion: 3 })).rejects.toMatchObject({ code: "INSUFFICIENT_PARTICIPATION_CREDITS" });
    expect(tx.pollCommentReaction.upsert).not.toHaveBeenCalled();
    expect(tx.pollCommentReactionRequest.create).not.toHaveBeenCalled();
  });

  it("bounds new reaction requests while allowing an identical replay above the limit", async () => {
    tx.pollCommentReactionRequest.count.mockResolvedValue(30);
    await expect(setProposalCommentReaction("poll-a", "comment-a", manager, { liked: true, requestKey: "limited-like-001" })).rejects.toMatchObject({ code: "REACTION_RATE_LIMIT", status: 429 });
    expect(tx.pollCommentReactionRequest.count).toHaveBeenCalledWith({ where: {
      pollId: "poll-a", actorKey: "user:owner", createdAt: { gte: expect.any(Date) }
    } });
    expect(tx.pollCommentReaction.upsert).not.toHaveBeenCalled();
    tx.pollCommentReactionRequest.findUnique.mockResolvedValue({ payloadHash: payloadHash({ pollId: "poll-a", commentId: "comment-a", liked: true }) });
    const result = await setProposalCommentReaction("poll-a", "comment-a", manager, { liked: true, requestKey: "limited-like-001" });
    expect(result.id).toBe("comment-a");
    expect(tx.pollCommentReactionRequest.count).toHaveBeenCalledTimes(1);
  });

  it("sponsors invited users without creating persistent balances and scopes their identity to their invitation", async () => {
    getParticipation.mockResolvedValue({ ...paidParticipation, sponsored: true, balance: null, effectiveCommentCost: 0, effectiveReactionCost: 0 });
    await setProposalCommentReaction("poll-a", "comment-a", temporary, { liked: true, requestKey: "invited-like-001" });
    expect(debitCredits).not.toHaveBeenCalled();
    expect(tx.pollCommentReaction.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: {
      pollId: "poll-a", commentId: "comment-a", actorKey: "access:access-a", authorPollVoterAccessId: "access-a", active: true, chargedBefore: false
    } }));
  });

  it("rejects foreign, hidden, archived and unauthorized reaction targets before any mutation", async () => {
    const input = { liked: true, requestKey: "invalid-target-01" };
    tx.pollComment.findFirst.mockResolvedValue(null);
    await expect(setProposalCommentReaction("poll-a", "foreign", manager, input)).rejects.toMatchObject({ code: "COMMENT_NOT_FOUND" });
    tx.pollComment.findFirst.mockResolvedValue(comment({ hiddenAt: new Date() }));
    await expect(setProposalCommentReaction("poll-a", "comment-a", manager, input)).rejects.toMatchObject({ code: "COMMENT_NOT_FOUND" });
    tx.pollComment.findFirst.mockResolvedValue(comment());
    tx.poll.findFirst.mockResolvedValue(proposal("ARCHIVED"));
    await expect(setProposalCommentReaction("poll-a", "comment-a", manager, input)).rejects.toMatchObject({ code: "DISCUSSION_READ_ONLY" });
    tx.poll.findFirst.mockResolvedValue(null);
    await expect(setProposalCommentReaction("poll-a", "comment-a", outsider, input)).rejects.toMatchObject({ code: "PROPOSAL_NOT_FOUND" });
    expect(tx.pollCommentReaction.upsert).not.toHaveBeenCalled();
    expect(debitCredits).not.toHaveBeenCalled();
  });

  it.each([{ liked: true }, { liked: "yes", requestKey: "bad-state-001" }, { liked: true, requestKey: "short" }, { liked: true, requestKey: "valid\nkey-001" }, { liked: true, requestKey: "valid-key-001", cost: 0 }])("rejects invalid reaction input %j", async (invalid) => {
    await expect(setProposalCommentReaction("poll-a", "comment-a", manager, invalid)).rejects.toMatchObject({ code: "INVALID_REACTION_INPUT" });
    expect(tx.pollCommentReaction.upsert).not.toHaveBeenCalled();
  });
});

describe("atomic community proposal drafts", () => {
  it("round-trips selected tags and commits to them in a new draft", async () => {
    tx.poll.create.mockImplementation(async ({ data }) => ({ ...proposal("DRAFT"), ...data }));
    const detail = await createCommunityProposal("community-a", "owner", { ...input, tags: ["education", "community"] });
    expect(detail.tags).toEqual(["community", "education"]);
    const data = tx.poll.create.mock.calls[0][0].data;
    expect(data.proposalTags).toEqual(detail.tags);
    expect(data.questionHash).toBe(proposalContentHash({ communityId: "community-a", title: input.title, body: input.body, tags: detail.tags, optionLabels: ["Approve", "Reject", "Abstain"], treasuryId: null, requestedAmountZat: null }));
  });

  it.each([["approved"], ["education", "education"], ["education", "community", "wallets", "research"], ["unknown"]].map((tags) => ({ tags })))("rejects unsupported tags before any mutation: %j", async ({ tags }) => {
    await expect(createCommunityProposal("community-a", "owner", { ...input, tags } as Parameters<typeof createCommunityProposal>[2])).rejects.toMatchObject({ code: "INVALID_PROPOSAL_INPUT" });
    await expect(saveCommunityProposalDraft("community-a", "poll-a", "owner", { ...input, tags } as Parameters<typeof createCommunityProposal>[2])).rejects.toMatchObject({ code: "INVALID_PROPOSAL_INPUT" });
    expect(tx.poll.create).not.toHaveBeenCalled();
    expect(tx.poll.updateMany).not.toHaveBeenCalled();
  });

  it("preserves tags omitted by older clients and removes them only when explicitly empty", async () => {
    const draft = { ...proposal("DRAFT"), proposalTags: ["education", "community"], optionALabel: "Approve", optionBLabel: "Reject", optionCLabel: "Abstain" };
    tx.poll.findFirst.mockResolvedValue(draft);
    tx.poll.updateMany.mockImplementation(async ({ data }) => { Object.assign(draft, data); return { count: 1 }; });
    expect((await saveCommunityProposalDraft("community-a", "poll-a", "owner", input)).tags).toEqual(["community", "education"]);
    expect(tx.poll.updateMany.mock.calls[0][0].data.proposalTags).toEqual(["community", "education"]);
    expect((await saveCommunityProposalDraft("community-a", "poll-a", "owner", { ...input, tags: [] })).tags).toEqual([]);
  });

  it("does not let tags bypass community scope or publication immutability", async () => {
    tx.community.findFirst.mockResolvedValue(null);
    await expect(saveCommunityProposalDraft("community-b", "poll-a", "outsider", { ...input, tags: ["education"] })).rejects.toMatchObject({ code: "PROPOSAL_NOT_FOUND" });
    tx.community.findFirst.mockResolvedValue(community);
    tx.poll.findFirst.mockResolvedValue(proposal("OPEN"));
    await expect(saveCommunityProposalDraft("community-a", "poll-a", "owner", { ...input, tags: ["education"] })).rejects.toMatchObject({ code: "PROPOSAL_NOT_DRAFT" });
    expect(tx.poll.updateMany).not.toHaveBeenCalled();
  });

  it("creates scoped content, exact funding and member roster atomically with no publication", async () => {
    await createCommunityProposal("community-a", "owner", { ...input, treasuryId: "fund-a", requestedAmountUsd: "1234.56" });
    const data = tx.poll.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ communityId: "community-a", audience: "DAO_MEMBERS", proposalBody: input.body, treasuryId: "fund-a", requestedAmountZat: null, requestedAmountUsdCents: 123456n, contentHashVersion: PROPOSAL_CONTENT_HASH_VERSION });
    expect(data.questionHash).toBe(proposalContentHash({ communityId: "community-a", title: input.title, body: input.body, optionLabels: ["Approve", "Reject", "Abstain"], treasuryId: "fund-a", requestedAmountZat: null, requestedAmountUsdCents: 123456n }));
    expect(data.voterAccesses.create).toEqual([expect.objectContaining({ nick: "Member", signalUsername: "member.01", expiresAt: new Date(input.closesAt) })]);
    expect(data).not.toHaveProperty("anchorTxid");
    expect(data).not.toHaveProperty("tickets");
    expect(data).not.toHaveProperty("invites");
    expect(tx.daoMember.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { communityId: "community-a", status: "ACTIVE" } }));
  });

  it("rejects foreign community managers, empty rosters and foreign funds before creating anything", async () => {
    tx.community.findFirst.mockResolvedValue(null);
    await expect(createCommunityProposal("community-b", "owner", input)).rejects.toMatchObject({ code: "PROPOSAL_NOT_FOUND" });
    tx.community.findFirst.mockResolvedValue(community);
    tx.daoMember.findMany.mockResolvedValue([]);
    await expect(createCommunityProposal("community-a", "owner", input)).rejects.toMatchObject({ code: "DAO_MEMBER_BASKET_EMPTY", status: 409 });
    tx.communityTreasury.findFirst.mockResolvedValue(null);
    await expect(createCommunityProposal("community-a", "owner", { ...input, treasuryId: "foreign-fund", requestedAmountUsd: "1" })).rejects.toMatchObject({ code: "TREASURY_NOT_FOUND" });
    expect(tx.communityTreasury.findFirst).toHaveBeenCalledWith({ where: { id: "foreign-fund", communityId: "community-a", currency: "ZEC" }, select: { id: true } });
    expect(tx.poll.create).not.toHaveBeenCalled();
  });

  it.each([{ treasuryId: "fund-a" }, { requestedAmountUsd: "1" }, { treasuryId: "fund-a", requestedAmountUsd: "0" }, { treasuryId: "fund-a", requestedAmountUsd: "0.001" }])("rejects incomplete or invalid funding %j", async (funding) => {
    await expect(createCommunityProposal("community-a", "owner", { ...input, ...funding })).rejects.toMatchObject({ code: "INVALID_PROPOSAL_INPUT", status: 400 });
    expect(tx.poll.create).not.toHaveBeenCalled();
  });

  it("saves only a scoped draft, recomputing its full commitment and access expiry", async () => {
    tx.poll.findFirst.mockResolvedValue({ ...proposal("DRAFT"), optionALabel: "Approve", optionBLabel: "Reject", optionCLabel: "Abstain" });
    const changed = { ...input, body: "An updated complete proposal body with a specific deliverable." };
    await saveCommunityProposalDraft("community-a", "poll-a", "owner", changed);
    expect(tx.poll.updateMany).toHaveBeenCalledWith({ where: { id: "poll-a", communityId: "community-a", status: "DRAFT" }, data: expect.objectContaining({ proposalBody: changed.body, contentHashVersion: PROPOSAL_CONTENT_HASH_VERSION, questionHash: proposalContentHash({ communityId: "community-a", title: changed.title, body: changed.body, optionLabels: ["Approve", "Reject", "Abstain"], treasuryId: null, requestedAmountZat: null }) }) });
    expect(tx.pollVoterAccess.updateMany).toHaveBeenCalledWith({ where: { pollId: "poll-a" }, data: { expiresAt: new Date(input.closesAt) } });
    tx.poll.findFirst.mockResolvedValue(proposal("SCHEDULED"));
    await expect(saveCommunityProposalDraft("community-a", "poll-a", "owner", input)).rejects.toMatchObject({ code: "PROPOSAL_NOT_DRAFT" });
    expect(tx.poll.updateMany).toHaveBeenCalledTimes(1);
  });

  it("serializes the exact requested amount as ZEC without JSON BigInt leakage", async () => {
    tx.poll.findFirst.mockResolvedValue({ ...proposal(), requestedAmountZat: 100000001n, treasury: { id: "fund-a", kind: "COMMUNITY", currency: "ZEC" } });
    const detail = await readProposalDetail("poll-a", manager, "community-a");
    expect(detail.requestedAmountZec).toBe("1.00000001");
    expect(detail.requestedAmountUsd).toBeNull();
    expect(() => JSON.stringify(detail)).not.toThrow();
  });

  it("returns USD cents without setting a ZEC price or a payment amount", async () => {
    tx.poll.findFirst.mockResolvedValue({ ...proposal(), requestedAmountUsdCents: 123456n, treasury: { id: "fund-a", kind: "COMMUNITY", currency: "ZEC" } });
    const detail = await readProposalDetail("poll-a", manager, "community-a");
    expect(detail.requestedAmountUsd).toBe("1234.56");
    expect(detail.requestedAmountZec).toBeNull();
    expect(() => JSON.stringify(detail)).not.toThrow();
  });

  it("rejects stale ZEC write payloads instead of interpreting them as dollars", async () => {
    await expect(createCommunityProposal("community-a", "owner", { ...input, treasuryId: "fund-a", requestedAmountZec: "24" } as unknown as Parameters<typeof createCommunityProposal>[2])).rejects.toMatchObject({ code: "INVALID_PROPOSAL_INPUT" });
    expect(tx.poll.create).not.toHaveBeenCalled();
  });
});
