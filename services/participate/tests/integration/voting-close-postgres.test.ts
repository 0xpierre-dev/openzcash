// @vitest-environment node
import { createHash, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const databaseUrl = process.env.TREASURY_TEST_DATABASE_URL;
if (databaseUrl) {
  const target = new URL(databaseUrl);
  if (target.hostname !== "127.0.0.1" || target.port !== (process.env.PARTICIPATE_TEST_PORT ?? "55438") || target.pathname !== "/community_treasury_tests") {
    throw new Error("Voting close tests require the dedicated local test database");
  }
}
const prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? "postgresql://unused@127.0.0.1:1/unused" });
const { fetchIncomingVotes, deliverReceipts } = vi.hoisted(() => ({ fetchIncomingVotes: vi.fn(), deliverReceipts: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: prisma }));
vi.mock("@/lib/zcash/zkool-client", () => ({ getZkoolClient: () => ({ fetchIncomingVotes }) }));
vi.mock("@/lib/services/vote-receipts", () => ({ deliverConfirmedVoteReceiptsForPoll: deliverReceipts }));
const { syncPollLifecycleForPoll } = await import("@/lib/services/poll-lifecycle");
const { reconcilePollVotes } = await import("@/lib/services/poll-reconcile");
const { applyDaoMembershipActionForPoll } = await import("@/lib/services/dao-members");
const { lockTicketChoice } = await import("@/lib/services/ticket-locking");

async function fixture(expired: boolean) {
  const marker = randomUUID();
  const digest = createHash("sha256").update(marker).digest("hex");
  const owner = await prisma.user.create({ data: { nick: `close-test-${marker}`, passwordHash: "test-record-with-no-login-password", role: "USER" } });
  const community = await prisma.community.create({ data: { name: "Voting close test", slug: `close-test-${marker}`, createdById: owner.id } });
  const poll = await prisma.poll.create({ data: {
    communityId: community.id, createdById: owner.id, question: "Admit a community member?", questionHash: digest,
    feeZat: 10000n, status: "OPEN", optionALabel: "Approve", optionBLabel: "Reject",
    opensAt: new Date(Date.now() - 3_600_000), closesAt: new Date(Date.now() + (expired ? -60_000 : 3_600_000)),
    eligibility: { create: { userId: owner.id } },
    membershipAction: { create: { type: "ADD_MEMBER", nick: `candidate-${marker}`, signalUsername: `candidate.${marker}` } }
  } });
  const ticket = await prisma.voteTicket.create({ data: {
    pollId: poll.id, ticketPublicId: `ticket-${marker}`, ticketHash: digest,
    assignment: { create: { userId: owner.id } },
    requests: { create: { optionLetter: "A", shieldedAddress: `utest-${marker}`, zip321Uri: `zcash:utest-${marker}` } }
  }, include: { requests: true } });
  return { poll, community, owner, ticket, request: ticket.requests[0],
    note: { shieldedAddress: ticket.requests[0].shieldedAddress, txid: digest, memo: "A", amountZat: 10000n, blockHeight: 123 } };
}

describe.skipIf(!databaseUrl)("PostgreSQL voting close safety", () => {
  beforeEach(() => { fetchIncomingVotes.mockReset(); deliverReceipts.mockReset(); deliverReceipts.mockResolvedValue({ sent: 0 }); });
  afterAll(async () => { await prisma.$disconnect(); });

  it("preserves locked requests through repeated/concurrent closes and does not apply a passing action", async () => {
    const f = await fixture(true);
    await prisma.voteTicket.update({ where: { id: f.ticket.id }, data: { status: "LOCKED", lockedRequestId: f.request.id, lockedOptionLetter: "A", lockedAt: new Date(+f.poll.closesAt - 1000) } });
    await prisma.pollTally.create({ data: { pollId: f.poll.id, totalConfirmed: 1, countA: 1 } });
    const results = await Promise.all(Array.from({ length: 6 }, () => syncPollLifecycleForPoll(f.poll.id)));
    expect(results.filter(result => result?.transition === "OPEN_TO_CLOSED")).toHaveLength(1);
    expect((await prisma.poll.findUniqueOrThrow({ where: { id: f.poll.id } })).status).toBe("CLOSED");
    expect((await prisma.voteTicket.findUniqueOrThrow({ where: { id: f.ticket.id } })).status).toBe("LOCKED");
    expect((await prisma.voteRequest.findUniqueOrThrow({ where: { id: f.request.id } })).status).toBe("ACTIVE");
    await expect(applyDaoMembershipActionForPoll(f.poll.id)).resolves.toMatchObject({ status: "PENDING" });
    expect((await prisma.daoMembershipAction.findUniqueOrThrow({ where: { pollId: f.poll.id } })).status).toBe("PENDING");
    expect(await prisma.daoMember.count({ where: { communityId: f.community.id } })).toBe(0);
  });

  it("leaves delayed collection pending without creating irreversible rejected receipts", async () => {
    const f = await fixture(true);
    await syncPollLifecycleForPoll(f.poll.id);
    fetchIncomingVotes.mockResolvedValue([f.note]);
    await expect(reconcilePollVotes(f.poll.id)).resolves.toEqual({ processed: 0, tallyPending: true });
    await expect(reconcilePollVotes(f.poll.id)).resolves.toEqual({ processed: 0, tallyPending: true });
    expect(fetchIncomingVotes).not.toHaveBeenCalled();
    expect(await prisma.voteReceipt.count({ where: { pollId: f.poll.id } })).toBe(0);
    expect((await prisma.voteRequest.findUniqueOrThrow({ where: { id: f.request.id } })).status).toBe("ACTIVE");
  });

  it("denies a new choice at an elapsed deadline even before lifecycle synchronization", async () => {
    const f = await fixture(true);
    await expect(lockTicketChoice({ pollId: f.poll.id, userId: f.owner.id, optionLetter: "A" }))
      .rejects.toMatchObject({ code: "TICKET_NOT_FOUND" });
    expect((await prisma.voteTicket.findUniqueOrThrow({ where: { id: f.ticket.id } })).status).toBe("ISSUED");
  });

  it("does not classify a receipt when closure happens during a wallet read", async () => {
    const f = await fixture(false);
    fetchIncomingVotes.mockImplementation(async () => {
      await prisma.poll.update({ where: { id: f.poll.id }, data: { status: "CLOSED" } });
      return [f.note];
    });
    await expect(reconcilePollVotes(f.poll.id)).resolves.toEqual({ processed: 0, tallyPending: true });
    expect(await prisma.voteReceipt.count({ where: { pollId: f.poll.id } })).toBe(0);
    expect(await prisma.pollTally.findUnique({ where: { pollId: f.poll.id } })).toBeNull();
    expect((await prisma.voteTicket.findUniqueOrThrow({ where: { id: f.ticket.id } })).status).toBe("ISSUED");
  });

  it("serializes concurrent receipt retries and increments the open tally once", async () => {
    const f = await fixture(false);
    fetchIncomingVotes.mockResolvedValue([f.note]);
    const results = await Promise.all([reconcilePollVotes(f.poll.id), reconcilePollVotes(f.poll.id)]);
    expect(results.reduce((sum, result) => sum + result.processed, 0)).toBe(1);
    expect(await prisma.voteReceipt.count({ where: { pollId: f.poll.id, status: "CONFIRMED" } })).toBe(1);
    expect(await prisma.pollTally.findUnique({ where: { pollId: f.poll.id } })).toMatchObject({ totalConfirmed: 1, countA: 1 });
  });
});
