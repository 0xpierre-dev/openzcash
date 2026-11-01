// @vitest-environment node
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { readPilotPackages } from "@/lib/archive/catalog";
const databaseUrl = process.env.TREASURY_TEST_DATABASE_URL;
if (databaseUrl) {
  const target = new URL(databaseUrl);
  if (target.hostname !== "127.0.0.1" || target.port !== (process.env.PARTICIPATE_TEST_PORT ?? "55438") || target.pathname !== "/community_treasury_tests") throw new Error("Requires disposable local test database");
}
const prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? "postgresql://unused@127.0.0.1:1/unused" });
vi.mock("@/lib/db", () => ({ db: prisma }));
const { publishArchiveRevision } = await import("@/lib/services/proposal-archives");
const { claimPreviewCredits, debitParticipationCredits } = await import("@/lib/services/participation-credits");
const { grantOperatorDemoCredits } = await import("@/lib/services/demo-credit-grants");
const sample = (await readPilotPackages())[0];
async function fixture() {
  const marker = randomUUID();
  const user = await prisma.user.create({ data: { nick: `demo-topup-${marker}`, email: `${marker}@example.test`, emailVerifiedAt: new Date(), passwordHash: "test-only", role: "USER" } });
  const host = await prisma.community.create({ data: { name: "Demo top-up host", slug: randomUUID(), createdById: user.id } });
  const committee = await prisma.community.create({ data: { name: "Demo top-up committee", kind: "COMMITTEE", slug: randomUUID(), createdById: user.id, participationMode: "CREDITS" } });
  await publishArchiveRevision(host.id, sample.bundle, sample.manifestHash, committee.id);
  vi.stubEnv("PARTICIPATE_PUBLIC_DEMO", "true"); vi.stubEnv("PARTICIPATE_COMMUNITY_ID", host.id); vi.stubEnv("PARTICIPATE_DEMO_COMMITTEE_ID", committee.id);
  await claimPreviewCredits(user.id, committee.id);
  const account = await prisma.creditAccount.findUniqueOrThrow({ where: { communityId_userId: { communityId: committee.id, userId: user.id } } });
  const input = { userId: user.id, nick: user.nick, communityId: committee.id, amount: 100, requestKey: `demo-topup:${marker}`, reason: "User requested free demo participation" };
  const archive = await prisma.proposalArchive.findFirstOrThrow({ where: { communityId: host.id, committeeId: committee.id } });
  return { user, host, committee, account, input, archive };
}
describe.skipIf(!databaseUrl)("PostgreSQL operator demo grant integrity", () => {
  beforeEach(() => { vi.stubEnv("DATABASE_URL", databaseUrl!); vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("PARTICIPATE_COMMITTEE_ENABLED", "true"); });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(() => prisma.$disconnect());
  it("deduplicates simultaneous top-ups, allows spending and retains an exact journal", async () => {
    const f = await fixture();
    const results = await Promise.all([grantOperatorDemoCredits(f.input, true), grantOperatorDemoCredits(f.input, true)]);
    expect(results.filter(result => result.applied)).toHaveLength(1);
    expect(results.filter(result => result.replayed)).toHaveLength(1);
    await prisma.$transaction(tx => debitParticipationCredits(tx, { communityId: f.committee.id, userId: f.user.id, cost: 1, kind: "COMMENT", targetType: "ARCHIVE", targetId: f.archive.id, policyVersion: 1, requestKey: randomUUID(), payloadHash: "f".repeat(64) }));
    expect(await grantOperatorDemoCredits(f.input, true)).toMatchObject({ replayed: true, balance: 124 });
    expect((await prisma.creditAccount.findUniqueOrThrow({ where: { id: f.account.id } })).balance).toBe(124);
    expect((await prisma.creditOperation.aggregate({ where: { accountId: f.account.id }, _sum: { delta: true } }))._sum.delta).toBe(124);
    expect(await prisma.treasuryOperation.count({ where: { communityId: f.committee.id } })).toBe(0);
  });
  it("rejects replay changes and preserves append-only history", async () => {
    const f = await fixture(); const granted = await grantOperatorDemoCredits(f.input, true);
    await expect(grantOperatorDemoCredits({ ...f.input, amount: 50 }, true)).rejects.toMatchObject({ code: "CREDIT_IDEMPOTENCY_CONFLICT" });
    await expect(prisma.creditOperation.update({ where: { id: granted.operationId! }, data: { delta: 1 } })).rejects.toThrow(/append-only/);
    await expect(prisma.creditOperation.delete({ where: { id: granted.operationId! } })).rejects.toThrow(/append-only/);
    await expect(prisma.creditAccount.update({ where: { id: f.account.id }, data: { balance: 999 } })).rejects.toThrow(/does not match its journal/);
  });
  it("rolls back the balance if a malformed journal entry fails the database constraint", async () => {
    const f = await fixture();
    await expect(prisma.$transaction(async tx => {
      await tx.creditAccount.update({ where: { id: f.account.id }, data: { balance: { increment: 1001 } } });
      await tx.creditOperation.create({ data: { accountId: f.account.id, userId: f.user.id, communityId: f.committee.id, kind: "ADMIN_DEMO_GRANT", delta: 1001, requestKey: f.input.requestKey, payloadHash: "a".repeat(64), targetId: f.input.reason, policyVersion: 1 } });
    })).rejects.toThrow();
    expect((await prisma.creditAccount.findUniqueOrThrow({ where: { id: f.account.id } })).balance).toBe(25);
  });
  it("database rejects a top-up without the original demo allowance", async () => {
    const f = await fixture();
    const outsider = await prisma.user.create({ data: { nick: `outsider-${randomUUID()}`, passwordHash: "test-only", role: "USER" } });
    const account = await prisma.creditAccount.create({ data: { communityId: f.committee.id, userId: outsider.id } });
    await expect(prisma.$transaction(async tx => {
      await tx.creditAccount.update({ where: { id: account.id }, data: { balance: { increment: 100 } } });
      await tx.creditOperation.create({ data: { accountId: account.id, userId: outsider.id, communityId: f.committee.id, kind: "ADMIN_DEMO_GRANT", delta: 100, requestKey: f.input.requestKey, payloadHash: "a".repeat(64), targetId: f.input.reason, policyVersion: 1 } });
    })).rejects.toThrow(/existing committee demo allowance/);
    expect((await prisma.creditAccount.findUniqueOrThrow({ where: { id: account.id } })).balance).toBe(0);
  });
});
