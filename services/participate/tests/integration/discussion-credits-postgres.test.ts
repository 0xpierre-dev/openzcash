// @vitest-environment node
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionPayload } from "@/lib/auth/guards";

const databaseUrl = process.env.CREDITS_TEST_DATABASE_URL ?? process.env.TREASURY_TEST_DATABASE_URL;
const enabled = Boolean(databaseUrl);
if (databaseUrl) {
  const target = new URL(databaseUrl);
  if (target.hostname !== "127.0.0.1" || target.port !== (process.env.PARTICIPATE_TEST_PORT ?? "55438") || !["/community_treasury_tests", "/community_credit_tests"].includes(target.pathname)) {
    throw new Error("Discussion credit tests require a dedicated local credit or treasury test database");
  }
}

const prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? "postgresql://unused@127.0.0.1:1/unused" });
const rollbackBody = "Test-only failure after the credit debit";
const discussionClient = prisma.$extends({ query: { pollComment: {
  async create({ args, query }) {
    if (args.data.body === rollbackBody) throw new Error("Test comment insert failure after debit");
    return query(args);
  }
} } });
vi.mock("@/lib/db", () => ({ db: discussionClient }));

const { postProposalComment, setProposalCommentReaction, readProposalDiscussion } = await import("@/lib/services/proposal-discussion");
const { claimPreviewCredits } = await import("@/lib/services/participation-credits");

let ownerId: string;
let communityId: string;
let pollId: string;
let session: SessionPayload;

async function balance() {
  return (await prisma.creditAccount.findUniqueOrThrow({ where: { communityId_userId: { communityId, userId: ownerId } } })).balance;
}

describe.skipIf(!enabled)("PostgreSQL discussion and credit atomicity", () => {
  beforeEach(async () => {
    vi.stubEnv("DATABASE_URL", databaseUrl!);
    vi.stubEnv("WORKSPACE_PREVIEW", "true");
    vi.stubEnv("NODE_ENV", "test");
    const marker = randomUUID();
    const user = await prisma.user.create({ data: { nick: `discussion-owner-${marker}`, passwordHash: "test-record-with-no-login-password", role: "USER" } });
    ownerId = user.id;
    const community = await prisma.community.create({ data: {
      name: "Credit discussion integration", slug: `credit-discussion-${marker}`, createdById: ownerId,
      participationMode: "CREDITS", commentCost: 2, reactionCost: 1, participationPolicyVersion: 2,
      memberships: { create: { userId: ownerId, role: "OWNER" } }
    } });
    communityId = community.id;
    const poll = await prisma.poll.create({ data: {
      communityId, createdById: ownerId, question: "Test proposal with paid discussion", questionHash: "test-only-proposal-hash",
      status: "OPEN", feeZat: 1n, opensAt: new Date(Date.now() - 60_000), closesAt: new Date(Date.now() + 3_600_000)
    } });
    pollId = poll.id;
    session = { subjectType: "user", userId: ownerId, nick: user.nick, role: "USER" };
    await claimPreviewCredits(ownerId, communityId);
    expect(await balance()).toBe(25);
  });

  afterAll(async () => { vi.unstubAllEnvs(); await prisma.$disconnect(); });

  it("rolls back an actual credit debit and journal when the later comment insert fails", async () => {
    await expect(postProposalComment(pollId, session, { body: rollbackBody, requestKey: randomUUID(), policyVersion: 2 })).rejects.toThrow("Test comment insert failure after debit");
    expect(await balance()).toBe(25);
    expect(await prisma.creditOperation.count({ where: { communityId, kind: "COMMENT" } })).toBe(0);
    expect(await prisma.pollComment.count({ where: { pollId } })).toBe(0);
  });

  it("deduplicates concurrent comment retries and charges exactly once", async () => {
    const input = { body: "A single contribution sent concurrently", requestKey: randomUUID(), policyVersion: 2 };
    const [a, b] = await Promise.all([postProposalComment(pollId, session, input), postProposalComment(pollId, session, input)]);
    expect(a.id).toBe(b.id);
    expect(await balance()).toBe(23);
    expect(await prisma.pollComment.count({ where: { pollId } })).toBe(1);
    expect(await prisma.creditOperation.count({ where: { communityId, kind: "COMMENT" } })).toBe(1);
    await prisma.community.update({ where: { id: communityId }, data: { commentCost: 5, participationPolicyVersion: 3 } });
    expect((await postProposalComment(pollId, session, input)).id).toBe(a.id);
    expect(await balance()).toBe(23);
  });

  it("prevents concurrent paid comments from consuming the same insufficient balance", async () => {
    await prisma.community.update({ where: { id: communityId }, data: { commentCost: 20 } });
    const results = await Promise.allSettled([
      postProposalComment(pollId, session, { body: "First costly contribution", requestKey: randomUUID(), policyVersion: 2 }),
      postProposalComment(pollId, session, { body: "Second costly contribution", requestKey: randomUUID(), policyVersion: 2 })
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "INSUFFICIENT_PARTICIPATION_CREDITS" } });
    expect(await balance()).toBe(5);
    expect(await prisma.pollComment.count({ where: { pollId } })).toBe(1);
    expect(await prisma.creditOperation.count({ where: { communityId, kind: "COMMENT" } })).toBe(1);
  });

  it("persists nested poll replies and debits each published reply only once", async () => {
    const root = await postProposalComment(pollId, session, { body: "Root", requestKey: randomUUID(), policyVersion: 2 });
    const emoji = await postProposalComment(pollId, session, { body: "🛡️", parentId: root.id, requestKey: randomUUID(), policyVersion: 2 });
    const input = { body: "Reply to the emoji", parentId: emoji.id, requestKey: randomUUID(), policyVersion: 2 };
    const [reply, replay] = await Promise.all([postProposalComment(pollId, session, input), postProposalComment(pollId, session, input)]);
    expect(reply.id).toBe(replay.id);
    expect(reply.parentId).toBe(emoji.id);
    expect(await prisma.pollComment.count({ where: { pollId } })).toBe(3);
    expect(await prisma.creditOperation.count({ where: { communityId, kind: "COMMENT" } })).toBe(3);
    expect(await balance()).toBe(19);
  });

  it("keeps simultaneous likes to one active reaction and one lifetime charge", async () => {
    const comment = await postProposalComment(pollId, session, { body: "Contribution receiving two simultaneous likes", requestKey: randomUUID(), policyVersion: 2 });
    await Promise.all([
      setProposalCommentReaction(pollId, comment.id, session, { liked: true, requestKey: randomUUID(), policyVersion: 2 }),
      setProposalCommentReaction(pollId, comment.id, session, { liked: true, requestKey: randomUUID(), policyVersion: 2 })
    ]);
    expect(await balance()).toBe(22);
    expect(await prisma.pollCommentReaction.count({ where: { commentId: comment.id, active: true } })).toBe(1);
    expect(await prisma.creditOperation.count({ where: { communityId, kind: "REACTION" } })).toBe(1);
    expect(await prisma.pollCommentReactionRequest.count({ where: { commentId: comment.id } })).toBe(2);
    const original = { liked: false, requestKey: randomUUID() };
    await setProposalCommentReaction(pollId, comment.id, session, original);
    await prisma.community.update({ where: { id: communityId }, data: { reactionCost: 5, participationPolicyVersion: 3 } });
    await setProposalCommentReaction(pollId, comment.id, session, { liked: true, requestKey: randomUUID(), policyVersion: 2 });
    const replay = await setProposalCommentReaction(pollId, comment.id, session, original);
    expect(replay.reaction).toEqual({ count: 1, likedByMe: true, chargedBefore: true });
    expect(await balance()).toBe(22);
    expect(await prisma.creditOperation.count({ where: { communityId, kind: "REACTION" } })).toBe(1);
    expect(await prisma.voteReceipt.count({ where: { pollId } })).toBe(0);
    expect(await prisma.voteTicket.count({ where: { pollId } })).toBe(0);
    expect(await prisma.pollTally.findUnique({ where: { pollId } })).toBeNull();
  });

  it("deduplicates simultaneous identical reaction requests without reversing later state", async () => {
    const comment = await postProposalComment(pollId, session, { body: "A contribution for replay checks", requestKey: randomUUID(), policyVersion: 2 });
    const input = { liked: true, requestKey: randomUUID(), policyVersion: 2 };
    await Promise.all([setProposalCommentReaction(pollId, comment.id, session, input), setProposalCommentReaction(pollId, comment.id, session, input)]);
    expect(await prisma.pollCommentReactionRequest.count({ where: { commentId: comment.id } })).toBe(1);
    await setProposalCommentReaction(pollId, comment.id, session, { liked: false, requestKey: randomUUID() });
    expect((await setProposalCommentReaction(pollId, comment.id, session, input)).reaction.likedByMe).toBe(false);
    expect(await balance()).toBe(22);
  });

  it("does not turn sponsored poll invitations into persistent credit accounts", async () => {
    const access = await prisma.pollVoterAccess.create({ data: { pollId, nick: "Invited participant", inviteToken: randomUUID(), expiresAt: new Date(Date.now() + 3_600_000) } });
    const guest: SessionPayload = { subjectType: "poll_voter_access", userId: "", pollId, pollVoterAccessId: access.id, nick: access.nick, role: "VOTER_TEMP" };
    const comment = await postProposalComment(pollId, guest, { body: "A sponsored contribution without a credit account" });
    await setProposalCommentReaction(pollId, comment.id, guest, { liked: true, requestKey: randomUUID() });
    expect(await prisma.creditAccount.count({ where: { communityId } })).toBe(1);
    expect(await prisma.creditOperation.count({ where: { communityId, kind: { in: ["COMMENT", "REACTION"] } } })).toBe(0);
    const discussion = await readProposalDiscussion(pollId, guest);
    expect(discussion.policy.participation).toMatchObject({ sponsored: true, availableCredits: null });
    expect(discussion.comments[0].reaction).toEqual({ count: 1, likedByMe: true, chargedBefore: false });
  });

  it("requires a displayed paid policy version and keeps unsupported-environment discussion readable without charging", async () => {
    await expect(postProposalComment(pollId, session, { body: "Missing policy acknowledgement", requestKey: randomUUID() })).rejects.toMatchObject({ code: "PARTICIPATION_POLICY_CHANGED" });
    expect(await balance()).toBe(25);
    expect(await prisma.pollComment.count({ where: { pollId } })).toBe(0);
    const comment = await postProposalComment(pollId, session, { body: "A contribution preserved when credits are unavailable", requestKey: randomUUID(), policyVersion: 2 });
    vi.stubEnv("NODE_ENV", "production");
    const discussion = await readProposalDiscussion(pollId, session);
    expect(discussion.comments).toHaveLength(1);
    expect(discussion.policy.participation).toMatchObject({ mode: "CREDITS", sandbox: false, availableCredits: 23 });
    await expect(postProposalComment(pollId, session, { body: "Paid comment outside the preview", requestKey: randomUUID(), policyVersion: 2 })).rejects.toMatchObject({ code: "PARTICIPATION_CREDITS_UNAVAILABLE" });
    await expect(setProposalCommentReaction(pollId, comment.id, session, { liked: true, requestKey: randomUUID(), policyVersion: 2 })).rejects.toMatchObject({ code: "PARTICIPATION_CREDITS_UNAVAILABLE" });
    expect(await balance()).toBe(23);
    expect(await prisma.pollComment.count({ where: { pollId } })).toBe(1);
    expect(await prisma.pollCommentReaction.count({ where: { pollId } })).toBe(0);
  });
});
