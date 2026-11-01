// @vitest-environment node
import { createHash, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTION_SOURCE_VERSION, CollectionObserverError, type CollectionSnapshot } from "@/lib/domain/poll-collection";

const databaseUrl = process.env.TREASURY_TEST_DATABASE_URL;
if (databaseUrl) {
  const target = new URL(databaseUrl);
  if (target.hostname !== "127.0.0.1" || target.port !== (process.env.PARTICIPATE_TEST_PORT ?? "55438") || target.pathname !== "/community_treasury_tests") throw new Error("Collection checks require the isolated local test database");
}
const prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? "postgresql://unused@127.0.0.1:1/unused" });
const { observer, config } = vi.hoisted(() => ({ observer: vi.fn(), config: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: prisma }));
vi.mock("@/lib/zcash/poll-history-observer", () => ({ observePollHistory: observer, readPollHistoryConfig: config }));
const { runCollectionCheck, readCollectionChecks } = await import("@/lib/services/poll-collection-checks");
const snapshot: CollectionSnapshot = { kind: "WALLET_HISTORY_ONLY", sourceVersion: COLLECTION_SOURCE_VERSION, sourceFingerprint: "a".repeat(64), network: "regtest", startHeight: 0, tipHeight: 100, tipHash: "b".repeat(64), scannedHeight: 100, transactionCount: 1, outputs: [] };

async function fixture() {
  const marker = randomUUID(); const digest = createHash("sha256").update(marker).digest("hex");
  const actor = await prisma.user.create({ data: { nick: `collection-test-${marker}`, passwordHash: "not-a-login-password", role: "USER" } });
  const community = await prisma.community.create({ data: { name: "Collection test", slug: `collection-test-${marker}`, createdById: actor.id,
    memberships: { create: { userId: actor.id, role: "OWNER" } } } });
  const poll = await prisma.poll.create({ data: { communityId: community.id, createdById: actor.id, question: "Test delayed collection and finalization boundary", questionHash: digest,
    feeZat: 10000n, status: "CLOSED", opensAt: new Date(Date.now() - 7200000), closesAt: new Date(Date.now() - 3600000),
    eligibility: { create: { userId: actor.id } }, tally: { create: { countA: 1, totalConfirmed: 1 } },
    membershipAction: { create: { type: "ADD_MEMBER", nick: `candidate-${marker}`, signalUsername: `candidate.${marker}` } } } });
  const ticket = await prisma.voteTicket.create({ data: { pollId: poll.id, ticketHash: digest, ticketPublicId: `collection-${marker}`,
    requests: { create: { optionLetter: "A", shieldedAddress: `utest-${marker}`, zip321Uri: `zcash:utest-${marker}` } } }, include: { requests: true } });
  const run = (requestKey = randomUUID()) => runCollectionCheck(community.id, poll.id, actor.id, { requestKey });
  return { actor, community, poll, ticket, run };
}
describe.skipIf(!databaseUrl)("PostgreSQL collection evidence", () => {
  beforeEach(() => { vi.clearAllMocks(); config.mockReturnValue({}); observer.mockResolvedValue(snapshot); });
  afterEach(() => vi.useRealTimers());
  afterAll(() => prisma.$disconnect());

  it("records one immutable private snapshot without confirming votes, closing requests, or executing membership", async () => {
    const f = await fixture();
    observer.mockResolvedValue({ ...snapshot, outputs: [{ requestId: f.ticket.requests[0].id, txid: "c".repeat(64), pool: "sapling", outputIndex: 0, amountZat: "10000", memo: "A", blockHeight: 95, blockHash: "d".repeat(64), blockTime: new Date().toISOString(), confirmations: 6 }] });
    const result = await f.run(); expect(result.check).toMatchObject({ status: "OBSERVED", outputCount: 1 });
    const saved = await prisma.pollCollectionCheck.findUniqueOrThrow({ where: { id: result.check.id } });
    const serialized = JSON.stringify(saved.evidence, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b, "en"))) : item);
    expect(saved.evidenceHash).toBe(createHash("sha256").update(serialized).digest("hex"));
    expect(saved.scopeHash).toMatch(/^[a-f0-9]{64}$/);
    expect((await prisma.poll.findUniqueOrThrow({ where: { id: f.poll.id } })).status).toBe("CLOSED");
    expect(await prisma.voteReceipt.count({ where: { pollId: f.poll.id } })).toBe(0);
    expect((await prisma.pollTally.findUniqueOrThrow({ where: { pollId: f.poll.id } })).totalConfirmed).toBe(1);
    expect((await prisma.voteRequest.findUniqueOrThrow({ where: { id: f.ticket.requests[0].id } })).status).toBe("ACTIVE");
    expect((await prisma.daoMembershipAction.findUniqueOrThrow({ where: { pollId: f.poll.id } })).status).toBe("PENDING");
    expect(await prisma.daoMember.count({ where: { communityId: f.community.id } })).toBe(0);
    const history = await readCollectionChecks(f.community.id, f.poll.id, f.actor.id);
    expect(JSON.stringify(history)).not.toMatch(/"memo"|"txid"|"requestId"|sourceFingerprint|utest-/);
    expect(history.finalization).toBe("POLICY_AND_CUTOFF_REQUIRED");
    await expect(prisma.pollCollectionCheck.update({ where: { id: saved.id }, data: { reason: "NOT_CONFIGURED" } })).rejects.toThrow();
    await expect(prisma.pollCollectionCheck.delete({ where: { id: saved.id } })).rejects.toThrow();
  });
  it("coalesces concurrent duplicate requests and rejects concurrent new keys", async () => {
    const f = await fixture(); const key = randomUUID();
    let release!: (value: CollectionSnapshot) => void;
    observer.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const first = f.run(key); await vi.waitFor(() => expect(observer).toHaveBeenCalledOnce());
    expect(await f.run(key)).toMatchObject({ replayed: true, check: { status: "RUNNING" } });
    await expect(f.run()).rejects.toMatchObject({ code: "CHECK_RATE_LIMITED" });
    release(snapshot); const result = await first;
    expect(await f.run(key)).toMatchObject({ replayed: true, check: { id: result.check.id, status: "OBSERVED" } });
    expect(observer).toHaveBeenCalledOnce();
  });
  it("records unconfigured or failed sources as blocked attempts with no fabricated evidence", async () => {
    const f = await fixture(); config.mockImplementation(() => { throw new CollectionObserverError("NOT_CONFIGURED"); });
    const result = await f.run(); expect(result.check).toMatchObject({ status: "BLOCKED", reason: "NOT_CONFIGURED", tipHeight: null, evidenceHash: null });
    expect(observer).not.toHaveBeenCalled();
    await expect(f.run()).rejects.toMatchObject({ code: "CHECK_RATE_LIMITED" });
  });
  it("recovers an interrupted worker and prevents its late result from replacing newer history", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const f = await fixture(); let release!: (value: CollectionSnapshot) => void;
    observer.mockImplementationOnce(() => new Promise(resolve => { release = resolve; })).mockResolvedValue(snapshot);
    const first = f.run(); await vi.waitFor(() => expect(observer).toHaveBeenCalledOnce());
    vi.setSystemTime(Date.now() + 61_000);
    expect((await readCollectionChecks(f.community.id, f.poll.id, f.actor.id)).checks[0]).toMatchObject({ status: "BLOCKED", reason: "CHECK_INTERRUPTED" });
    const next = await f.run(); expect(next.check.status).toBe("OBSERVED");
    release(snapshot); expect((await first).check).toMatchObject({ status: "BLOCKED", reason: "CHECK_INTERRUPTED" });
    expect(await prisma.pollCollectionCheck.count({ where: { pollId: f.poll.id, status: "OBSERVED" } })).toBe(1);
  });
  it("rejects foreign, inactive and open-round requests before reading the wallet", async () => {
    const a = await fixture(); const b = await fixture();
    await expect(runCollectionCheck(a.community.id, b.poll.id, a.actor.id, { requestKey: randomUUID() })).rejects.toMatchObject({ status: 404 });
    await expect(readCollectionChecks(a.community.id, a.poll.id, b.actor.id)).rejects.toMatchObject({ status: 404 });
    await prisma.poll.update({ where: { id: a.poll.id }, data: { status: "OPEN", closesAt: new Date(Date.now() + 3600000) } });
    await expect(a.run()).rejects.toMatchObject({ code: "VOTING_NOT_CLOSED" });
    await prisma.communityMembership.updateMany({ where: { userId: b.actor.id }, data: { status: "DISABLED" } });
    await expect(b.run()).rejects.toMatchObject({ status: 404 });
    expect(observer).not.toHaveBeenCalled();
  });
  it("rechecks authorization and scope after a slow wallet read", async () => {
    const f = await fixture(); observer.mockImplementation(async () => {
      await prisma.poll.update({ where: { id: f.poll.id }, data: { passingThresholdPercent: 80 } }); return snapshot;
    });
    expect((await f.run()).check).toMatchObject({ status: "BLOCKED", reason: "PROPOSAL_CHANGED" });
    const revoked = await fixture(); observer.mockImplementation(async () => {
      await prisma.communityMembership.updateMany({ where: { userId: revoked.actor.id }, data: { status: "DISABLED" } }); return snapshot;
    });
    await expect(revoked.run()).rejects.toMatchObject({ status: 404 });
    expect(await prisma.pollCollectionCheck.count({ where: { pollId: revoked.poll.id, status: "OBSERVED" } })).toBe(0);
  });
});
