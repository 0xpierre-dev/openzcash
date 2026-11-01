// @vitest-environment node
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { readPilotPackages } from "@/lib/archive/catalog";
import { readReviewPackages } from "@/lib/archive/review-proposals";

const databaseUrl = process.env.TREASURY_TEST_DATABASE_URL;
if (databaseUrl) {
  const target = new URL(databaseUrl);
  if (target.hostname !== "127.0.0.1" || target.port !== (process.env.PARTICIPATE_TEST_PORT ?? "55438") || target.pathname !== "/community_treasury_tests") throw new Error("Archive credit tests require the named disposable database");
}
const prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? "postgresql://unused@127.0.0.1:1/unused" });
const rollbackBody = "Test-only insert failure after debit";
const client = prisma.$extends({ query: { archiveComment: { async create({ args, query }) {
  if (args.data.body === rollbackBody) throw new Error("Insert failed after debit");
  return query(args);
} } } });
vi.mock("@/lib/db", () => ({ db: client }));
const { publishArchiveRevision } = await import("@/lib/services/proposal-archives");
const { readArchiveDiscussion, mutateArchiveDiscussion, readProposalParticipationBoard, setArchiveProposalLike } = await import("@/lib/services/archive-discussion");
const { claimPreviewCredits, readAccountCredits, debitParticipationCredits, updateParticipationPolicy } = await import("@/lib/services/participation-credits");
const { findManagedCommunity } = await import("@/lib/services/communities");
const { readCommunityTreasuries } = await import("@/lib/services/treasuries");
const { readProposalDiscussion } = await import("@/lib/services/proposal-discussion");
const sample = (await readPilotPackages())[0];
const recordId = sample.manifest.recordId;
const input = (body = "A public proposal comment") => ({ body, requestKey: randomUUID(), policyVersion: 2 });
const like = (liked = true) => ({ liked, requestKey: randomUUID(), policyVersion: 2 });

async function fixture() {
  const owner = await prisma.user.create({ data: { nick: `archive-credit-owner-${randomUUID()}`, passwordHash: "test-only", role: "USER" } });
  const user = await prisma.user.create({ data: { nick: `archive-credit-reader-${randomUUID()}`, passwordHash: "test-only", role: "USER" } });
  const community = await prisma.community.create({ data: { name: "Public proposal credit test", slug: randomUUID(), createdById: owner.id,
    participationMode: "CREDITS", commentCost: 2, reactionCost: 1, participationPolicyVersion: 2,
    memberships: { create: { userId: owner.id, role: "OWNER" } } } });
  const revision = await publishArchiveRevision(community.id, sample.bundle, sample.manifestHash);
  const session = { subjectType: "user" as const, userId: user.id, role: user.role, nick: user.nick };
  await claimPreviewCredits(user.id, community.id);
  return { owner, user, community, session, revision,
    balance: async () => (await prisma.creditAccount.findUniqueOrThrow({ where: { communityId_userId: { communityId: community.id, userId: user.id } } })).balance };
}

describe.skipIf(!databaseUrl)("Public proposals use the existing Zcred ledger", () => {
  beforeEach(() => { vi.stubEnv("PARTICIPATE_COMMITTEE_ENABLED", "true"); vi.stubEnv("DATABASE_URL", databaseUrl!); vi.stubEnv("WORKSPACE_PREVIEW", "true"); vi.stubEnv("NODE_ENV", "test"); });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(() => prisma.$disconnect());

  async function committeeFixture(fund = true) {
    const f = await fixture();
    const committeeOwner = await prisma.user.create({ data: { nick: `committee-owner-${randomUUID()}`, passwordHash: "test-only", role: "USER" } });
    const committee = await prisma.community.create({ data: { name: "ZCG test committee", kind: "COMMITTEE", slug: randomUUID(), createdById: committeeOwner.id,
      participationMode: "CREDITS", commentCost: 3, reactionCost: 2, participationPolicyVersion: 5,
      memberships: { create: { userId: committeeOwner.id, role: "OWNER" } } } });
    await prisma.communityMembership.create({ data: { communityId: f.community.id, userId: f.user.id, role: "MANAGER" } });
    await publishArchiveRevision(f.community.id, sample.bundle, sample.manifestHash, committee.id);
    if (fund) await claimPreviewCredits(f.user.id, committee.id);
    return { ...f, committee, committeeOwner, committeeBalance: async () => (await readAccountCredits(f.user.id, committee.id)).accounts[0].balance };
  }

  it("charges committee prices and balances for comments and both kinds of like, preserving the DAO", async () => {
    const f = await committeeFixture();
    expect((await readProposalParticipationBoard(f.community.id, f.session)).participation).toMatchObject({
      communityId: f.committee.id, commentCost: 3, reactionCost: 2, availableCredits: 25,
      creditScope: { id: f.committee.id, kind: "COMMITTEE", name: "ZCG test committee" }
    });
    const comment = await mutateArchiveDiscussion(f.community.id, recordId, f.session, "post", { ...input(), policyVersion: 5 });
    await setArchiveProposalLike(f.community.id, recordId, f.session, { ...like(), policyVersion: 5 });
    await mutateArchiveDiscussion(f.community.id, recordId, f.session, "reaction", { ...like(), policyVersion: 5 }, comment.id);
    expect(await f.committeeBalance()).toBe(18);
    expect(await f.balance()).toBe(25);
    expect(await prisma.creditOperation.count({ where: { communityId: f.community.id, kind: { in: ["COMMENT", "REACTION"] } } })).toBe(0);
    expect((await prisma.archiveRevision.findUniqueOrThrow({ where: { id: f.revision.id } })).manifestHash).toBe(sample.manifestHash);
  });

  it("publishes pending applications idempotently and uses committee credits for their discussion", async () => {
    const f = await committeeFixture();
    const pending = (await readReviewPackages())[0];
    const first = await publishArchiveRevision(f.community.id, pending.bundle, pending.manifestHash, f.committee.id);
    const again = await publishArchiveRevision(f.community.id, pending.bundle, pending.manifestHash, f.committee.id);
    expect(first.id).toBe(again.id);
    const id = pending.manifest.recordId;
    const guest = await readArchiveDiscussion(f.community.id, id, null);
    expect(guest.proposal).toMatchObject({ likes: 0, commentCount: 0 });
    expect(guest.capabilities.canPost).toBe(false);
    const comment = await mutateArchiveDiscussion(f.community.id, id, f.session, "post", { ...input("A question about the pending application"), policyVersion: 5 });
    await setArchiveProposalLike(f.community.id, id, f.session, { ...like(), policyVersion: 5 });
    expect((await readArchiveDiscussion(f.community.id, id, f.session)).comments.some(row => row.id === comment.id)).toBe(true);
    expect(await f.committeeBalance()).toBe(20);
    expect(await f.balance()).toBe(25);
    expect(await prisma.poll.count({ where: { communityId: f.community.id } })).toBe(0);
    expect(await prisma.archiveAnchor.count({ where: { revisionId: first.id } })).toBe(0);
  });

  it("never falls back to funded DAO credits when the committee balance is empty", async () => {
    const f = await committeeFixture(false);
    expect(await f.balance()).toBe(25);
    expect(await f.committeeBalance()).toBe(0);
    await expect(setArchiveProposalLike(f.community.id, recordId, f.session, { ...like(), policyVersion: 5 }))
      .rejects.toMatchObject({ code: "INSUFFICIENT_PARTICIPATION_CREDITS" });
    await expect(prisma.$transaction(tx => debitParticipationCredits(tx, { communityId: f.community.id, userId: f.user.id,
      kind: "REACTION", targetType: "ARCHIVE", targetId: f.revision.archiveId, cost: 1, policyVersion: 2, requestKey: randomUUID(), payloadHash: "c".repeat(64) })))
      .rejects.toMatchObject({ code: "COMMUNITY_NOT_FOUND" });
    expect(await f.balance()).toBe(25);
    expect((await readProposalParticipationBoard(f.community.id, f.session)).proposals[0].likes).toBe(0);
  });

  it("uses committee permissions for policy and moderation without granting DAO or treasury authority", async () => {
    const f = await committeeFixture();
    const comment = await mutateArchiveDiscussion(f.community.id, recordId, f.session, "post", { ...input(), policyVersion: 5 });
    const daoOwnerSession = { ...f.session, userId: f.owner.id };
    const committeeSession = { ...f.session, userId: f.committeeOwner.id };
    expect((await readArchiveDiscussion(f.community.id, recordId, daoOwnerSession)).capabilities.canModerate).toBe(false);
    await expect(mutateArchiveDiscussion(f.community.id, recordId, daoOwnerSession, "hide", { reason: "Wrong scope" }, comment.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(updateParticipationPolicy(f.committee.id, f.owner.id, { mode: "FREE", commentCost: 3, reactionCost: 2, expectedVersion: 5 })).rejects.toMatchObject({ code: "COMMUNITY_NOT_FOUND" });
    expect((await mutateArchiveDiscussion(f.community.id, recordId, committeeSession, "hide", { reason: "Committee moderation" }, comment.id)).hidden).toBe(true);
    expect(await findManagedCommunity(f.committee.id, f.committeeOwner.id)).toBeNull();
    await expect(readCommunityTreasuries(f.committee.id, f.committeeOwner.id)).rejects.toMatchObject({ code: "COMMUNITY_NOT_FOUND" });
    await expect(prisma.proposalArchive.update({ where: { id: f.revision.archiveId }, data: { committeeId: f.community.id } })).rejects.toThrow();
    await expect(prisma.community.update({ where: { id: f.committee.id }, data: { kind: "DAO" } })).rejects.toThrow();
  });

  it("keeps demo moderation and credit settings read-only even with an active committee owner membership", async () => {
    const f = await committeeFixture();
    const comment = await mutateArchiveDiscussion(f.community.id, recordId, f.session, "post", { ...input(), policyVersion: 5 });
    const id = `preview_${randomUUID()}`;
    await prisma.user.create({ data: { id, nick: id, role: "USER", passwordHash: "" } });
    await prisma.communityMembership.create({ data: { userId: id, communityId: f.committee.id, role: "OWNER" } });
    const session = { ...f.session, userId: id };
    const eventCount = await prisma.archiveActivityEvent.count({ where: { archiveId: f.revision.archiveId } });
    expect((await readArchiveDiscussion(f.community.id, recordId, session)).capabilities.canModerate).toBe(false);
    await expect(mutateArchiveDiscussion(f.community.id, recordId, session, "hide", { reason: "Demo moderation" }, comment.id)).rejects.toMatchObject({ code: "forbidden" });
    expect((await prisma.archiveComment.findUniqueOrThrow({ where: { id: comment.id } })).hiddenAt).toBeNull();
    expect(await prisma.archiveActivityEvent.count({ where: { archiveId: f.revision.archiveId } })).toBe(eventCount);
    expect((await readAccountCredits(id, f.committee.id)).accounts[0].canManage).toBe(false);
    await expect(updateParticipationPolicy(f.committee.id, id, { mode: "FREE", commentCost: 3, reactionCost: 2, expectedVersion: 5 })).rejects.toMatchObject({ code: "POLICY_PERSONAL_ACCOUNT_REQUIRED" });
    expect(await prisma.community.findUniqueOrThrow({ where: { id: f.committee.id } })).toMatchObject({ participationMode: "CREDITS", participationPolicyVersion: 5 });
  });

  it("allows a public account without DAO membership and exposes only its own balance", async () => {
    const f = await fixture();
    expect((await readAccountCredits(f.user.id, f.community.id)).accounts[0].balance).toBe(25);
    const board = await readProposalParticipationBoard(f.community.id, f.session);
    expect(board).toMatchObject({ canParticipate: true, participation: { availableCredits: 25, commentCost: 2, reactionCost: 1 } });
    const guest = await readProposalParticipationBoard(f.community.id, null);
    expect(guest).toMatchObject({ canParticipate: false, participation: { availableCredits: null } });
    expect(JSON.stringify(guest)).not.toContain(f.user.id);
    expect(await prisma.daoMember.count({ where: { userId: f.user.id } })).toBe(0);
    const poll = await prisma.poll.create({ data: { communityId: f.community.id, createdById: f.owner.id, question: "Private DAO ballot", questionHash: randomUUID(), status: "OPEN", feeZat: 1n, opensAt: new Date(), closesAt: new Date(Date.now() + 60000) } });
    await expect(readProposalDiscussion(poll.id, f.session)).rejects.toThrow();
  });
  it("debits a concurrent retried comment exactly once and preserves the original replay after a price change", async () => {
    const f = await fixture(), data = input();
    const comments = await Promise.all([1, 2, 3].map(() => mutateArchiveDiscussion(f.community.id, recordId, f.session, "post", data)));
    expect(new Set(comments.map(comment => comment.id)).size).toBe(1);
    expect(await f.balance()).toBe(23);
    expect(await prisma.creditOperation.count({ where: { communityId: f.community.id, kind: "COMMENT" } })).toBe(1);
    await prisma.community.update({ where: { id: f.community.id }, data: { commentCost: 7, participationPolicyVersion: 3 } });
    expect((await mutateArchiveDiscussion(f.community.id, recordId, f.session, "post", data)).id).toBe(comments[0].id);
    await expect(mutateArchiveDiscussion(f.community.id, recordId, f.session, "post", { ...data, body: "changed" })).rejects.toMatchObject({ code: "COMMENT_IDEMPOTENCY_CONFLICT" });
    expect(await f.balance()).toBe(23);
  });
  it("rolls back the balance and journal when comment publication fails", async () => {
    const f = await fixture();
    await expect(mutateArchiveDiscussion(f.community.id, recordId, f.session, "post", input(rollbackBody))).rejects.toThrow("Insert failed after debit");
    expect(await f.balance()).toBe(25);
    expect(await prisma.creditOperation.count({ where: { communityId: f.community.id, kind: "COMMENT" } })).toBe(0);
    expect(await prisma.archiveComment.count({ where: { archiveId: f.revision.archiveId } })).toBe(0);
  });
  it("prevents concurrent overspending and rejects a stale or missing price version", async () => {
    const f = await fixture();
    await prisma.community.update({ where: { id: f.community.id }, data: { commentCost: 20, participationPolicyVersion: 3 } });
    await expect(mutateArchiveDiscussion(f.community.id, recordId, f.session, "post", input())).rejects.toMatchObject({ code: "PARTICIPATION_POLICY_CHANGED" });
    await expect(mutateArchiveDiscussion(f.community.id, recordId, f.session, "post", { body: "No price", requestKey: randomUUID() })).rejects.toMatchObject({ code: "PARTICIPATION_POLICY_CHANGED" });
    const results = await Promise.allSettled([1, 2].map(n => mutateArchiveDiscussion(f.community.id, recordId, f.session, "post", { ...input(`Comment ${n}`), policyVersion: 3 })));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { code: "INSUFFICIENT_PARTICIPATION_CREDITS" } });
    expect(await f.balance()).toBe(5);
  });
  it("charges proposal likes once, makes unlike/restore free, and does not replay an old state", async () => {
    const f = await fixture(), data = like();
    await Promise.all([1, 2, 3].map(() => setArchiveProposalLike(f.community.id, recordId, f.session, data)));
    expect(await f.balance()).toBe(24);
    await setArchiveProposalLike(f.community.id, recordId, f.session, like(false));
    expect((await setArchiveProposalLike(f.community.id, recordId, f.session, data)).proposal).toMatchObject({ likes: 0, likedByMe: false, chargedBefore: true });
    await prisma.community.update({ where: { id: f.community.id }, data: { reactionCost: 5, participationPolicyVersion: 3 } });
    expect((await setArchiveProposalLike(f.community.id, recordId, f.session, like())).proposal.likes).toBe(1);
    expect(await f.balance()).toBe(24);
    expect(await prisma.creditOperation.count({ where: { communityId: f.community.id, kind: "REACTION" } })).toBe(1);
    await expect(prisma.archiveProposalLike.update({ where: { archiveId_userId: { archiveId: f.revision.archiveId, userId: f.user.id } }, data: { chargedBefore: false } })).rejects.toThrow();
    const request = await prisma.archiveProposalLikeRequest.findFirstOrThrow({ where: { archiveId: f.revision.archiveId } });
    await expect(prisma.archiveProposalLikeRequest.delete({ where: { id: request.id } })).rejects.toThrow();
  });
  it("uses the same journal for comment likes, retains prior charges and blocks hidden comments", async () => {
    const f = await fixture();
    const comment = await mutateArchiveDiscussion(f.community.id, recordId, f.session, "post", input());
    await Promise.all([1, 2].map(() => mutateArchiveDiscussion(f.community.id, recordId, f.session, "reaction", like(), comment.id)));
    expect(await f.balance()).toBe(22);
    await mutateArchiveDiscussion(f.community.id, recordId, f.session, "reaction", like(false), comment.id);
    expect((await readArchiveDiscussion(f.community.id, recordId, f.session)).comments[0].reaction).toMatchObject({ count: 0, chargedBefore: true });
    await mutateArchiveDiscussion(f.community.id, recordId, f.session, "reaction", like(), comment.id);
    expect(await f.balance()).toBe(22);
    await mutateArchiveDiscussion(f.community.id, recordId, { ...f.session, userId: f.owner.id }, "hide", { reason: "Local moderation test" }, comment.id);
    await expect(mutateArchiveDiscussion(f.community.id, recordId, f.session, "reaction", like(), comment.id)).rejects.toMatchObject({ code: "COMMENT_ALREADY_HIDDEN" });
    expect((await readProposalParticipationBoard(f.community.id, f.session)).proposals[0].commentCount).toBe(0);
  });
  it("does not cross communities, accepts no unconfirmed money and pauses review accounts", async () => {
    const f = await fixture(), other = await fixture();
    await expect(prisma.$transaction(tx => debitParticipationCredits(tx, { communityId: f.community.id, userId: f.user.id, kind: "REACTION", targetType: "ARCHIVE", targetId: other.revision.archiveId, cost: 1, policyVersion: 2, requestKey: randomUUID(), payloadHash: "a".repeat(64) }))).rejects.toMatchObject({ code: "COMMUNITY_NOT_FOUND" });
    await prisma.creditAccount.update({ where: { communityId_userId: { communityId: f.community.id, userId: f.user.id } }, data: { paymentReview: true } });
    await expect(setArchiveProposalLike(f.community.id, recordId, f.session, like())).rejects.toMatchObject({ code: "CREDIT_PAYMENT_REVIEW" });
    expect(await f.balance()).toBe(25);
    vi.stubEnv("WORKSPACE_PREVIEW", "false");
    await expect(setArchiveProposalLike(other.community.id, recordId, other.session, like())).rejects.toMatchObject({ code: "PARTICIPATION_CREDITS_UNAVAILABLE" });
  });
  it("keeps free participation free and disables writes for inactive accounts", async () => {
    const f = await fixture();
    await prisma.community.update({ where: { id: f.community.id }, data: { participationMode: "FREE", participationPolicyVersion: 3 } });
    await mutateArchiveDiscussion(f.community.id, recordId, f.session, "post", { body: "Free perspective", requestKey: randomUUID() });
    await setArchiveProposalLike(f.community.id, recordId, f.session, { liked: true, requestKey: randomUUID() });
    expect(await f.balance()).toBe(25);
    await prisma.user.update({ where: { id: f.user.id }, data: { status: "DISABLED" } });
    await expect(setArchiveProposalLike(f.community.id, recordId, f.session, like())).rejects.toMatchObject({ code: "forbidden" });
    expect((await readProposalParticipationBoard(f.community.id, f.session)).participation?.availableCredits).toBeNull();
  });
});
