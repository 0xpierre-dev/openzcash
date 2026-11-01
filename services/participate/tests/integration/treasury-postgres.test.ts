// @vitest-environment node
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const databaseUrl = process.env.TREASURY_TEST_DATABASE_URL;
const enabled = Boolean(databaseUrl);
if (databaseUrl) {
  const target = new URL(databaseUrl);
  if (target.hostname !== "127.0.0.1" || target.pathname !== "/community_treasury_tests") {
    throw new Error("Treasury integration tests require the isolated local community_treasury_tests database");
  }
}
const prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? "postgresql://unused@127.0.0.1:1/unused" });
vi.mock("@/lib/db", () => ({ db: prisma }));
const { allocateTreasuryFunds, readCommunityTreasuries, recordTreasuryFunding } = await import("@/lib/services/treasuries");

let communityA: string;
let communityB: string;
let ownerA: string;
let ownerB: string;
let managerA: string;

const funding = (amountZec = "10", idempotencyKey = randomUUID()) => ({
  treasuryKind: "COMMUNITY", amountZec, fundingSource: "Local test funding", reason: "Recorded funding test", idempotencyKey
});
const allocation = (amountZec = "7", idempotencyKey = randomUUID()) => ({
  fromTreasuryKind: "COMMUNITY", toTreasuryKind: "SUSTAINABILITY", amountZec, reason: "Local reserve allocation", idempotencyKey
});

describe.skipIf(!enabled)("PostgreSQL treasury transactions", () => {
  beforeEach(async () => {
    const marker = randomUUID();
    const users = await Promise.all(["owner-a", "owner-b", "manager-a"].map((name) => prisma.user.create({
      data: { nick: `${name}-${marker}`, passwordHash: "test-record-with-no-login-password", role: "ADMIN", status: "ACTIVE" }
    })));
    [ownerA, ownerB, managerA] = users.map((user) => user.id);
    const a = await prisma.community.create({ data: {
      name: "Treasury test A", slug: `treasury-test-a-${marker}`, createdById: ownerA,
      memberships: { create: [{ userId: ownerA, role: "OWNER" }, { userId: managerA, role: "MANAGER" }] }
    } });
    const b = await prisma.community.create({ data: {
      name: "Treasury test B", slug: `treasury-test-b-${marker}`, createdById: ownerB,
      memberships: { create: { userId: ownerB, role: "OWNER" } }
    } });
    [communityA, communityB] = [a.id, b.id];
  });

  afterAll(async () => { await prisma.$disconnect(); });

  it("prevents concurrent overspending and conserves paired balances", async () => {
    await recordTreasuryFunding(communityA, ownerA, funding());
    const results = await Promise.allSettled([
      allocateTreasuryFunds(communityA, ownerA, allocation()),
      allocateTreasuryFunds(communityA, ownerA, allocation())
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "INSUFFICIENT_RECORDED_FUNDS" } });
    const view = await readCommunityTreasuries(communityA, ownerA);
    expect(view.funds.map((fund) => fund.availableZat)).toEqual(["300000000", "700000000"]);
    const entries = await prisma.treasuryLedgerEntry.findMany({ where: { communityId: communityA } });
    expect(entries).toHaveLength(3);
    expect(entries.reduce((sum, entry) => sum + entry.deltaZat, 0n)).toBe(1_000_000_000n);
  });

  it("deduplicates simultaneous funding and allocation retries", async () => {
    const add = funding();
    const additions = await Promise.all([
      recordTreasuryFunding(communityA, ownerA, add), recordTreasuryFunding(communityA, ownerA, add)
    ]);
    expect(additions.filter((result) => result.replayed)).toHaveLength(1);
    const transfer = allocation("3");
    const transfers = await Promise.all([
      allocateTreasuryFunds(communityA, ownerA, transfer), allocateTreasuryFunds(communityA, ownerA, transfer)
    ]);
    expect(transfers.filter((result) => result.replayed)).toHaveLength(1);
    expect(await prisma.treasuryOperation.count({ where: { communityId: communityA } })).toBe(2);
    const view = await readCommunityTreasuries(communityA, ownerA);
    expect(view.funds.map((fund) => fund.availableZat)).toEqual(["700000000", "300000000"]);
  });

  it("fails closed across communities and on manager/disabled memberships despite global ADMIN", async () => {
    await expect(recordTreasuryFunding(communityB, ownerA, funding())).rejects.toMatchObject({ code: "COMMUNITY_NOT_FOUND" });
    await expect(recordTreasuryFunding(communityA, managerA, funding())).rejects.toMatchObject({ code: "TREASURY_OWNER_REQUIRED" });
    expect((await readCommunityTreasuries(communityA, managerA)).canManage).toBe(false);
    await prisma.communityMembership.update({ where: { communityId_userId: { communityId: communityA, userId: ownerA } }, data: { status: "DISABLED" } });
    await expect(recordTreasuryFunding(communityA, ownerA, funding())).rejects.toMatchObject({ code: "COMMUNITY_NOT_FOUND" });
    expect(await prisma.treasuryOperation.count({ where: { communityId: communityA } })).toBe(0);
  });

  it("enforces same-community treasury references and append-only journal history", async () => {
    await recordTreasuryFunding(communityA, ownerA, funding());
    await recordTreasuryFunding(communityB, ownerB, funding());
    const foreign = await prisma.communityTreasury.findUniqueOrThrow({ where: { communityId_kind: { communityId: communityB, kind: "COMMUNITY" } } });
    await expect(prisma.poll.create({ data: {
      question: "Foreign fund", questionHash: "test", communityId: communityA, treasuryId: foreign.id,
      requestedAmountZat: 1n, feeZat: 1n, opensAt: new Date(), closesAt: new Date(Date.now() + 10000), createdById: ownerA
    } })).rejects.toThrow();
    const entry = await prisma.treasuryLedgerEntry.findFirstOrThrow({ where: { communityId: communityA } });
    await expect(prisma.treasuryLedgerEntry.update({ where: { id: entry.id }, data: { deltaZat: 1n } })).rejects.toThrow(/Recorded treasury history/);
    await expect(prisma.treasuryOperation.delete({ where: { id: entry.operationId } })).rejects.toThrow(/Recorded treasury history/);
  });
});
