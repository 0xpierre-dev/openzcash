// @vitest-environment node
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it, vi } from "vitest";

const databaseUrl = process.env.TREASURY_TEST_DATABASE_URL;
if (databaseUrl) {
  const target = new URL(databaseUrl);
  if (target.hostname !== "127.0.0.1" || target.port !== (process.env.PARTICIPATE_TEST_PORT ?? "55438") || target.pathname !== "/community_treasury_tests") throw new Error("Membership tests require the dedicated local test database");
}
const prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? "postgresql://unused@127.0.0.1:1/unused" });
vi.mock("@/lib/db", () => ({ db: prisma }));
vi.mock("@/lib/zcash/zkool-client", () => ({ getZkoolClient: () => ({ isConfigured: () => false }) }));
const { requestDaoMembership, createAccountMembershipProposal, reviewMembershipRequest, initializeAccountRoster, readMembershipRequests, readMyMembership } = await import("@/lib/services/account-membership");
const { applyDaoMembershipActionForPoll } = await import("@/lib/services/dao-members");
const { createCommunityProposal } = await import("@/lib/services/proposal-discussion");
const { createDraftPoll, buildAndStoreAnchorMemo } = await import("@/lib/services/polls");
const { issueTicketForVoter } = await import("@/lib/services/tickets");
const communityIds: string[] = [];
const userIds: string[] = [];

async function fixture(roster = true) {
  const marker = randomUUID();
  const owner = await prisma.user.create({ data: { nick: `member-owner-${marker}`, passwordHash: "test-only-no-login", role: "USER" } });
  const applicant = await prisma.user.create({ data: { nick: `applicant-${marker}`, passwordHash: "test-only-no-login", role: "USER" } });
  const outsider = await prisma.user.create({ data: { nick: `outsider-${marker}`, passwordHash: "test-only-no-login", role: "ADMIN" } });
  userIds.push(owner.id, applicant.id, outsider.id);
  const community = await prisma.community.create({ data: { name: "Account membership test", slug: `account-members-${marker}`, createdById: owner.id, memberships: { create: { userId: owner.id, role: "OWNER" } } } });
  communityIds.push(community.id);
  const published = await prisma.poll.create({ data: { communityId: community.id, createdById: owner.id, question: "Public community history", questionHash: "test", feeZat: 10000n, status: "CLOSED", opensAt: new Date("2026-01-01Z"), closesAt: new Date("2026-01-02Z") } });
  if (roster) {
    await prisma.daoMember.create({ data: { communityId: community.id, userId: owner.id, nick: owner.nick, signalUsername: `legacy-owner-${marker}.42` } });
    await prisma.daoMember.create({ data: { communityId: community.id, nick: `legacy-${marker}`, signalUsername: `legacy-${marker}.42` } });
  }
  return { community, owner, applicant, outsider, published };
}
const dates = () => ({ opensAt: new Date(Date.now() + 3_600_000).toISOString(), closesAt: new Date(Date.now() + 172_800_000).toISOString() });
const proposalInput = (requestId: string) => ({ requestKey: randomUUID(), question: "Should this account join our voting roster?", ...dates(), action: { type: "ADD_MEMBER" as const, requestId } });
async function admission(f: Awaited<ReturnType<typeof fixture>>) {
  const request = await requestDaoMembership(f.community.id, f.applicant.id, { requestId: randomUUID() });
  const input = proposalInput(request.id);
  const proposal = await createAccountMembershipProposal(f.community.id, f.owner.id, input);
  return { request, input, proposal };
}
async function finalize(pollId: string) {
  // Synthetic finalized evidence for service tests only; no production override is exposed.
  await prisma.poll.update({ where: { id: pollId }, data: { status: "FINALIZED", tally: { update: { countA: 2, totalConfirmed: 2 } } } });
  return applyDaoMembershipActionForPoll(pollId);
}

describe.skipIf(!databaseUrl)("PostgreSQL account-native membership", () => {
  afterAll(async () => {
    await prisma.poll.deleteMany({ where: { communityId: { in: communityIds } } });
    await prisma.daoMember.deleteMany({ where: { communityId: { in: communityIds } } });
    await prisma.daoMembershipRequest.deleteMany({ where: { communityId: { in: communityIds } } });
    await prisma.communityMembership.deleteMany({ where: { communityId: { in: communityIds } } });
    await prisma.community.deleteMany({ where: { id: { in: communityIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it("deduplicates concurrent requests without granting membership or revealing another account", async () => {
    const f = await fixture();
    const attempts = await Promise.all(Array.from({ length: 6 }, () => requestDaoMembership(f.community.id, f.applicant.id, { requestId: randomUUID() })));
    expect(new Set(attempts.map(request => request.id)).size).toBe(1);
    expect(await prisma.daoMembershipRequest.count({ where: { communityId: f.community.id } })).toBe(1);
    expect(await prisma.daoMember.count({ where: { communityId: f.community.id, userId: f.applicant.id } })).toBe(0);
    expect(await prisma.communityMembership.count({ where: { userId: f.applicant.id } })).toBe(0);
    expect(await readMyMembership(f.community.id, f.applicant.id)).toMatchObject({ memberStatus: null, request: { status: "PENDING" } });
    await expect(readMembershipRequests(f.community.id, f.outsider.id)).rejects.toMatchObject({ code: "COMMUNITY_NOT_FOUND" });
    await expect(reviewMembershipRequest(f.community.id, f.outsider.id, attempts[0].id, "withdraw")).rejects.toMatchObject({ code: "REQUEST_NOT_FOUND" });
    expect(await readMembershipRequests(f.community.id, f.owner.id)).toEqual([expect.objectContaining({ nick: f.applicant.nick })]);
    expect(attempts[0]).not.toHaveProperty("userId");
  });

  it("requires active accounts and published scope, and preserves closed request attempts", async () => {
    const f = await fixture();
    await prisma.poll.update({ where: { id: f.published.id }, data: { status: "DRAFT" } });
    await expect(requestDaoMembership(f.community.id, f.applicant.id, { requestId: randomUUID() })).rejects.toMatchObject({ code: "COMMUNITY_NOT_FOUND" });
    await prisma.poll.update({ where: { id: f.published.id }, data: { status: "CLOSED" } });
    const request = await requestDaoMembership(f.community.id, f.applicant.id, { requestId: randomUUID() });
    await reviewMembershipRequest(f.community.id, f.applicant.id, request.id, "withdraw");
    expect(await requestDaoMembership(f.community.id, f.applicant.id, { requestId: request.id })).toMatchObject({ status: "WITHDRAWN" });
    await expect(requestDaoMembership(f.community.id, f.applicant.id, { requestId: randomUUID() })).rejects.toMatchObject({ code: "REQUEST_COOLDOWN" });
    await prisma.user.update({ where: { id: f.applicant.id }, data: { status: "DISABLED" } });
    await expect(requestDaoMembership(f.community.id, f.applicant.id, { requestId: request.id })).rejects.toMatchObject({ code: "ACCOUNT_UNAVAILABLE" });
  });

  it("initializes only once with consenting accounts, without issuing administrative roles", async () => {
    const f = await fixture(false);
    const request = await requestDaoMembership(f.community.id, f.applicant.id, { requestId: randomUUID() });
    await expect(initializeAccountRoster(f.community.id, f.outsider.id, { includeSelf: true, requestIds: [] })).rejects.toMatchObject({ code: "COMMUNITY_NOT_FOUND" });
    await initializeAccountRoster(f.community.id, f.owner.id, { includeSelf: true, requestIds: [request.id] });
    expect(await prisma.daoMember.count({ where: { communityId: f.community.id, signalUsername: null } })).toBe(2);
    expect((await readMyMembership(f.community.id, f.applicant.id)).request?.status).toBe("ADMITTED");
    expect(await prisma.communityMembership.count({ where: { userId: f.applicant.id } })).toBe(0);
    await prisma.daoMember.updateMany({ where: { communityId: f.community.id }, data: { status: "REMOVED" } });
    await expect(initializeAccountRoster(f.community.id, f.owner.id, { includeSelf: true, requestIds: [] })).rejects.toMatchObject({ code: "DAO_MEMBER_BOOTSTRAP_LOCKED" });
  });

  it("keeps request IDs and removal targets scoped to the selected DAO", async () => {
    const a = await fixture(); const b = await fixture();
    const request = await requestDaoMembership(a.community.id, a.applicant.id, { requestId: randomUUID() });
    await expect(createAccountMembershipProposal(b.community.id, b.owner.id, proposalInput(request.id))).rejects.toMatchObject({ code: "REQUEST_ALREADY_REVIEWED" });
    const target = await prisma.daoMember.findFirstOrThrow({ where: { communityId: a.community.id } });
    await expect(createAccountMembershipProposal(b.community.id, b.owner.id, { requestKey: randomUUID(), question: "Remove a foreign member?", ...dates(), action: { type: "REMOVE_MEMBER", targetMemberId: target.id } })).rejects.toMatchObject({ code: "MEMBER_NOT_FOUND" });
    await expect(reviewMembershipRequest(b.community.id, b.owner.id, request.id, "decline")).rejects.toMatchObject({ code: "REQUEST_NOT_FOUND" });
  });

  it("freezes one entitlement per account, preserves legacy invites and retries the same draft once", async () => {
    const f = await fixture();
    const request = await requestDaoMembership(f.community.id, f.applicant.id, { requestId: randomUUID() });
    const input = proposalInput(request.id);
    const outcomes = await Promise.all(Array.from({ length: 4 }, () => createAccountMembershipProposal(f.community.id, f.owner.id, input)));
    expect(new Set(outcomes.map(value => value.pollId)).size).toBe(1);
    const poll = await prisma.poll.findUniqueOrThrow({ where: { id: outcomes[0].pollId }, include: { eligibility: true, voterAccesses: true, membershipAction: true } });
    expect(poll.eligibility.map(entry => entry.userId)).toEqual([f.owner.id]);
    expect(poll.voterAccesses).toHaveLength(1);
    expect(poll.voterAccesses[0].nick).not.toBe(f.owner.nick);
    expect(poll.membershipAction).toMatchObject({ userId: f.applicant.id, requestId: request.id, signalUsername: null });
    expect(await prisma.pollEligibility.count({ where: { userId: f.applicant.id } })).toBe(0);
    await expect(createAccountMembershipProposal(f.community.id, f.owner.id, { ...input, question: "A changed question reusing a request key" })).rejects.toMatchObject({ code: "REQUEST_KEY_REUSED" });
    await expect(createAccountMembershipProposal(f.community.id, f.owner.id, { ...input, requestKey: randomUUID() })).rejects.toMatchObject({ code: "REQUEST_ALREADY_REVIEWED" });
    await prisma.communityMembership.updateMany({ where: { communityId: f.community.id, userId: f.owner.id }, data: { status: "DISABLED" } });
    await expect(createAccountMembershipProposal(f.community.id, f.owner.id, input)).rejects.toMatchObject({ code: "COMMUNITY_NOT_FOUND" });
  });

  it("does not bind matching nicknames or change legacy identity records", async () => {
    const f = await fixture();
    const legacy = await prisma.daoMember.create({ data: { communityId: f.community.id, nick: f.applicant.nick, signalUsername: `unrelated-${randomUUID()}.42` } });
    const request = await requestDaoMembership(f.community.id, f.applicant.id, { requestId: randomUUID() });
    await expect(createAccountMembershipProposal(f.community.id, f.owner.id, proposalInput(request.id))).rejects.toMatchObject({ code: "MEMBER_IDENTITY_CONFLICT" });
    expect(await prisma.daoMember.findUnique({ where: { id: legacy.id } })).toMatchObject({ userId: null });
  });

  it("keeps CLOSED pending, then admits the exact consenting account once at FINALIZED", async () => {
    const f = await fixture(); const a = await admission(f);
    await prisma.poll.update({ where: { id: a.proposal.pollId }, data: { status: "CLOSED", tally: { update: { countA: 2, totalConfirmed: 2 } } } });
    expect(await applyDaoMembershipActionForPoll(a.proposal.pollId)).toMatchObject({ status: "PENDING" });
    expect(await prisma.daoMember.count({ where: { communityId: f.community.id, userId: f.applicant.id } })).toBe(0);
    expect(await finalize(a.proposal.pollId)).toMatchObject({ status: "APPLIED" });
    expect(await applyDaoMembershipActionForPoll(a.proposal.pollId)).toBeNull();
    expect(await prisma.daoMember.count({ where: { communityId: f.community.id, userId: f.applicant.id } })).toBe(1);
    expect((await readMyMembership(f.community.id, f.applicant.id)).request?.status).toBe("ADMITTED");
    expect(await prisma.communityMembership.count({ where: { userId: f.applicant.id } })).toBe(0);
  });

  it.each(["withdrawn", "revoked"])("does not admit a %s applicant even after an approving ballot", async kind => {
    const f = await fixture(); const a = await admission(f);
    if (kind === "withdrawn") await reviewMembershipRequest(f.community.id, f.applicant.id, a.request.id, "withdraw");
    else await prisma.user.update({ where: { id: f.applicant.id }, data: { status: "DISABLED" } });
    expect(await finalize(a.proposal.pollId)).toMatchObject({ status: "REJECTED" });
    expect(await prisma.daoMember.count({ where: { communityId: f.community.id, userId: f.applicant.id } })).toBe(0);
  });

  it("commits the stable account target before anchoring and refuses a substituted target", async () => {
    const f = await fixture(); const a = await admission(f);
    await prisma.daoMembershipAction.update({ where: { pollId: a.proposal.pollId }, data: { userId: f.outsider.id } });
    await expect(buildAndStoreAnchorMemo(a.proposal.pollId)).rejects.toMatchObject({ code: "MEMBERSHIP_COMMITMENT_INVALID" });
    await expect(finalize(a.proposal.pollId)).rejects.toMatchObject({ code: "MEMBERSHIP_COMMITMENT_INVALID" });
    expect(await prisma.daoMember.count({ where: { communityId: f.community.id, userId: f.outsider.id } })).toBe(0);
  });

  it("uses accounts in both draft builders and preserves frozen ballot access after removal", async () => {
    const f = await fixture(); const a = await admission(f); await finalize(a.proposal.pollId);
    const general = await createCommunityProposal(f.community.id, f.owner.id, { title: "A community proposal for new account members", body: "A sufficiently detailed community proposal for the integration test.", ...dates() });
    await prisma.poll.update({ where: { id: general.id }, data: { status: "OPEN" } });
    expect(await prisma.pollEligibility.count({ where: { pollId: general.id, userId: f.applicant.id } })).toBe(1);
    const member = await prisma.daoMember.findUniqueOrThrow({ where: { communityId_userId: { communityId: f.community.id, userId: f.applicant.id } } });
    const removal = await createAccountMembershipProposal(f.community.id, f.owner.id, { requestKey: randomUUID(), question: "Should we remove this member from our roster?", ...dates(), action: { type: "REMOVE_MEMBER", targetMemberId: member.id } });
    await finalize(removal.pollId);
    const next = await createDraftPoll({ communityId: f.community.id, question: "A new round after membership removal", ...dates(), optionALabel: "Approve", optionBLabel: "Reject", audience: "DAO_MEMBERS" }, f.owner.id);
    expect(await prisma.pollEligibility.count({ where: { pollId: next.id, userId: f.applicant.id } })).toBe(0);
    expect(await prisma.user.findUnique({ where: { id: f.applicant.id } })).toMatchObject({ status: "ACTIVE" });
    const ticket = await issueTicketForVoter({ pollId: general.id, userId: f.applicant.id, feeZec: "0.0001", optionLetters: ["A", "B", "C"] });
    expect(ticket.pollId).toBe(general.id);
    expect((await issueTicketForVoter({ pollId: general.id, userId: f.applicant.id, feeZec: "0.0001", optionLetters: ["A", "B", "C"] })).id).toBe(ticket.id);
  });
});
