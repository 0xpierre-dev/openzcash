// @vitest-environment node
import { createHash, randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";

const databaseUrl = process.env.CREDITS_TEST_DATABASE_URL ?? process.env.TREASURY_TEST_DATABASE_URL;
if (databaseUrl) {
  const target = new URL(databaseUrl);
  if (target.hostname !== "127.0.0.1" || target.port !== (process.env.PARTICIPATE_TEST_PORT ?? "55438") || !["/community_treasury_tests", "/community_credit_tests"].includes(target.pathname)) throw new Error("Credit integration tests require the dedicated local test database");
}
const prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? "postgresql://unused@127.0.0.1:1/unused" });
vi.mock("@/lib/db", () => ({ db: prisma }));
const { claimPreviewCredits, debitParticipationCredits, updateParticipationPolicy } = await import("@/lib/services/participation-credits");

let communityId: string;
let foreignCommunityId: string;
let userId: string;
let foreignUserId: string;
let pollId: string;
let policyVersion: number;
const intentHash = (target: string) => createHash("sha256").update(target).digest("hex");
async function debit(requestKey: string, targetId = pollId) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try { return await prisma.$transaction(tx => debitParticipationCredits(tx, { communityId, userId, cost: 20, kind: "COMMENT", targetId, policyVersion, requestKey, payloadHash: intentHash(targetId) }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code) && attempt < 4) continue;
      throw error;
    }
  }
  throw new Error("Unreachable retry");
}

describe.skipIf(!databaseUrl)("PostgreSQL participation credit integrity", () => {
  beforeEach(async () => {
    vi.stubEnv("DATABASE_URL", databaseUrl!); vi.stubEnv("WORKSPACE_PREVIEW", "true"); vi.stubEnv("NODE_ENV", "test");
    const marker = randomUUID();
    const users = await Promise.all(["credit-owner", "credit-outsider"].map(name => prisma.user.create({ data: { nick: `${name}-${marker}`, role: "ADMIN", passwordHash: "no-login-test-record" } })));
    [userId, foreignUserId] = users.map(user => user.id);
    const communities = await Promise.all(users.map((user, index) => prisma.community.create({ data: { name: `Credit fixture ${index}`, slug: `credits-${index}-${marker}`, createdById: user.id, memberships: { create: { userId: user.id, role: "OWNER" } } } })));
    [communityId, foreignCommunityId] = communities.map(community => community.id);
    const poll = await prisma.poll.create({ data: { communityId, createdById: userId, question: "Credit fixture proposal", questionHash: "test", status: "OPEN", feeZat: 1n, opensAt: new Date(), closesAt: new Date(Date.now() + 86_400_000) } });
    pollId = poll.id;
    policyVersion = (await updateParticipationPolicy(communityId, userId, { mode: "CREDITS", commentCost: 20, reactionCost: 1, expectedVersion: 1 })).version;
  });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => { await prisma.$disconnect(); });

  it("issues one grant under simultaneous retries and never replenishes spent credits", async () => {
    const results = await Promise.all([claimPreviewCredits(userId, communityId), claimPreviewCredits(userId, communityId)]);
    expect(results.filter(result => result.replayed)).toHaveLength(1);
    expect(await prisma.creditOperation.count({ where: { communityId, kind: "PREVIEW_GRANT" } })).toBe(1);
    await debit(`comment:${randomUUID()}`);
    expect(await claimPreviewCredits(userId, communityId)).toEqual({ replayed: true, balance: 5 });
    expect(await prisma.treasuryOperation.count({ where: { communityId } })).toBe(0);
  });

  it("prevents concurrent overspending and reconciles the account with its journal", async () => {
    await claimPreviewCredits(userId, communityId);
    const results = await Promise.allSettled([debit(`comment:${randomUUID()}`), debit(`comment:${randomUUID()}`)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { code: "INSUFFICIENT_PARTICIPATION_CREDITS" } });
    const account = await prisma.creditAccount.findUniqueOrThrow({ where: { communityId_userId: { communityId, userId } } });
    expect(account.balance).toBe(5);
    const journal = await prisma.creditOperation.findMany({ where: { accountId: account.id } });
    expect(journal).toHaveLength(2); expect(journal.reduce((sum, operation) => sum + operation.delta, 0)).toBe(account.balance);
  });

  it("deduplicates concurrent identical debits and rejects foreign targets/accounts", async () => {
    await claimPreviewCredits(userId, communityId);
    const key = `comment:${randomUUID()}`;
    const results = await Promise.all([debit(key), debit(key)]);
    expect(results.filter(result => result.replayed)).toHaveLength(1);
    expect(await prisma.creditOperation.count({ where: { communityId, kind: "COMMENT" } })).toBe(1);
    await expect(claimPreviewCredits(userId, foreignCommunityId)).rejects.toMatchObject({ code: "COMMUNITY_NOT_FOUND" });
    const foreign = await prisma.poll.create({ data: { communityId: foreignCommunityId, createdById: foreignUserId, question: "Foreign target", questionHash: "test", status: "OPEN", feeZat: 1n, opensAt: new Date(), closesAt: new Date(Date.now() + 86_400_000) } });
    await expect(debit(`comment:${randomUUID()}`, foreign.id)).rejects.toMatchObject({ code: "COMMUNITY_NOT_FOUND" });
  });

  it("enforces append-only operations, nonnegative balances and complete journal reconciliation", async () => {
    await claimPreviewCredits(userId, communityId);
    const operation = await prisma.creditOperation.findFirstOrThrow({ where: { communityId } });
    await expect(prisma.creditOperation.update({ where: { id: operation.id }, data: { delta: 24 } })).rejects.toThrow(/append-only/);
    await expect(prisma.creditOperation.delete({ where: { id: operation.id } })).rejects.toThrow(/append-only/);
    await expect(prisma.creditAccount.update({ where: { id: operation.accountId }, data: { balance: 24 } })).rejects.toThrow(/does not match its journal/);
    await expect(prisma.creditAccount.update({ where: { id: operation.accountId }, data: { balance: -1 } })).rejects.toThrow();
    expect((await prisma.creditAccount.findUniqueOrThrow({ where: { id: operation.accountId } })).balance).toBe(25);
  });
});
