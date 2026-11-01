// @vitest-environment node
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fundingQuoteExpiresAt } from "@/lib/domain/funding-quote";
import { ZecPriceError } from "@/lib/market/zec-usd";

const databaseUrl = process.env.TREASURY_TEST_DATABASE_URL;
if (databaseUrl) {
  const target = new URL(databaseUrl);
  if (target.hostname !== "127.0.0.1" || target.port !== (process.env.PARTICIPATE_TEST_PORT ?? "55438") || target.pathname !== "/community_treasury_tests") {
    throw new Error("Funding quote tests require the dedicated local treasury test database");
  }
}
const prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? "postgresql://unused@127.0.0.1:1/unused" });
vi.mock("@/lib/db", () => ({ db: prisma }));
const market = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/market/zec-usd", async (original) => ({ ...await original<typeof import("@/lib/market/zec-usd")>(), getZecUsdPrice: market.get }));
const { createFundingQuote, readFundingQuotes } = await import("@/lib/services/funding-quotes");

let ownerId: string, communityId: string, pollId: string, treasuryId: string;
const proposalHash = "a".repeat(64);
const input = () => ({ requestKey: randomUUID(), proposalHash });
const freshPrice = () => ({ rateUsdPerZecE8: 300000000n, quotedAt: new Date(Math.floor(Date.now() / 1000) * 1000), retrievedAt: new Date() });

describe.skipIf(!databaseUrl)("PostgreSQL indicative funding quotes", () => {
  beforeEach(async () => {
    market.get.mockReset().mockImplementation(async () => freshPrice());
    const marker = randomUUID();
    ownerId = (await prisma.user.create({ data: { nick: `quote-owner-${marker}`, passwordHash: "test-no-login", role: "USER" } })).id;
    communityId = (await prisma.community.create({ data: { name: "Quote integration", slug: `quote-${marker}`, createdById: ownerId, memberships: { create: { userId: ownerId, role: "OWNER" } } } })).id;
    treasuryId = (await prisma.communityTreasury.create({ data: { communityId, kind: "COMMUNITY", availableZat: 100000000n } })).id;
    pollId = (await prisma.poll.create({ data: {
      communityId, createdById: ownerId, question: "USD quote integration proposal", questionHash: proposalHash,
      contentHashVersion: "PROPOSAL_CONTENT_V3", proposalBody: "A test proposal with a precise USD budget.",
      requestedAmountUsdCents: 100n, treasuryId, feeZat: 0n, opensAt: new Date("2027-01-01"), closesAt: new Date("2027-01-03")
    } })).id;
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it("saves exact snapshots, replays once and leaves budgets, statuses and fund balances unchanged", async () => {
    const beforePoll = await prisma.poll.findUniqueOrThrow({ where: { id: pollId } });
    const beforeFund = await prisma.communityTreasury.findUniqueOrThrow({ where: { id: treasuryId } });
    const request = input();
    const saved = await createFundingQuote(communityId, pollId, ownerId, request);
    expect(Math.abs(Date.now() - +new Date(saved.quote.createdAt))).toBeLessThan(5000);
    expect(saved.quote).toMatchObject({ kind: "ESTIMATE", usdCents: "100", rateUsdPerZecE8: "300000000", amountZat: "33333334", rounding: "CEILING_ZAT", fees: "EXCLUDED" });
    market.get.mockResolvedValueOnce({ ...freshPrice(), rateUsdPerZecE8: 600000000n });
    const replay = await createFundingQuote(communityId, pollId, ownerId, request);
    expect(replay).toEqual({ ...saved, replayed: true });
    expect(market.get).toHaveBeenCalledTimes(1);
    const second = await createFundingQuote(communityId, pollId, ownerId, input());
    expect(second.quote.amountZat).toBe("16666667");
    const history = await readFundingQuotes(communityId, pollId, ownerId);
    expect(history.quotes.map((q) => q.id)).toEqual([second.quote.id, saved.quote.id]);
    expect(await prisma.poll.findUniqueOrThrow({ where: { id: pollId } })).toEqual(beforePoll);
    expect(await prisma.communityTreasury.findUniqueOrThrow({ where: { id: treasuryId } })).toEqual(beforeFund);
    expect(await prisma.treasuryOperation.count({ where: { communityId } })).toBe(0);
  });

  it("coalesces concurrent identical saves with one durable record", async () => {
    const request = input();
    const results = await Promise.all([createFundingQuote(communityId, pollId, ownerId, request), createFundingQuote(communityId, pollId, ownerId, request)]);
    expect(results[0].quote.id).toBe(results[1].quote.id);
    expect(results.filter((r) => r.replayed)).toHaveLength(1);
    expect(await prisma.proposalFundingQuote.count({ where: { pollId } })).toBe(1);
  });

  it("hides foreign and revoked communities even from global administrators", async () => {
    const outsider = await prisma.user.create({ data: { nick: `outsider-${randomUUID()}`, passwordHash: "test-no-login", role: "ADMIN" } });
    await expect(readFundingQuotes(communityId, pollId, outsider.id)).rejects.toMatchObject({ status: 404 });
    await expect(createFundingQuote("foreign", pollId, ownerId, input())).rejects.toMatchObject({ status: 404 });
    await prisma.communityMembership.update({ where: { communityId_userId: { communityId, userId: ownerId } }, data: { status: "DISABLED" } });
    await expect(createFundingQuote(communityId, pollId, ownerId, input())).rejects.toMatchObject({ status: 404 });
    expect(market.get).not.toHaveBeenCalled();
  });

  it("allows managers to estimate without granting payment authority, and denies disabled accounts", async () => {
    await prisma.communityMembership.update({ where: { communityId_userId: { communityId, userId: ownerId } }, data: { role: "MANAGER" } });
    expect((await createFundingQuote(communityId, pollId, ownerId, input())).quote.kind).toBe("ESTIMATE");
    await prisma.user.update({ where: { id: ownerId }, data: { status: "DISABLED" } });
    await expect(readFundingQuotes(communityId, pollId, ownerId)).rejects.toMatchObject({ status: 404 });
  });

  it("retains old versions as history and rejects edits or revocation racing a price request", async () => {
    const saved = await createFundingQuote(communityId, pollId, ownerId, input());
    market.get.mockImplementationOnce(async () => {
      await prisma.poll.update({ where: { id: pollId }, data: { questionHash: "b".repeat(64), requestedAmountUsdCents: 200n } });
      return freshPrice();
    });
    await expect(createFundingQuote(communityId, pollId, ownerId, input())).rejects.toMatchObject({ code: "PROPOSAL_CHANGED" });
    const history = await readFundingQuotes(communityId, pollId, ownerId);
    expect(history.usdCents).toBe("200"); expect(history.quotes[0]).toEqual(saved.quote);
    market.get.mockImplementationOnce(async () => {
      await prisma.communityMembership.update({ where: { communityId_userId: { communityId, userId: ownerId } }, data: { status: "DISABLED" } });
      return freshPrice();
    });
    await expect(createFundingQuote(communityId, pollId, ownerId, { ...input(), proposalHash: history.proposalHash })).rejects.toMatchObject({ status: 404 });
    expect(await prisma.proposalFundingQuote.count({ where: { pollId } })).toBe(1);
  });

  it("bounds concurrent provider attempts, including errors, across the database", async () => {
    market.get.mockRejectedValue(new ZecPriceError());
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => createFundingQuote(communityId, pollId, ownerId, input())));
    expect(results.filter((r) => r.status === "rejected" && r.reason.code === "QUOTE_RATE_LIMITED")).toHaveLength(3);
    expect(market.get).toHaveBeenCalledTimes(5);
    expect(await prisma.proposalFundingQuote.count({ where: { pollId } })).toBe(0);
    await prisma.fundingQuoteThrottle.update({ where: { userId: ownerId }, data: { resetsAt: new Date(Date.now() - 1000) } });
    market.get.mockResolvedValue(freshPrice());
    expect((await createFundingQuote(communityId, pollId, ownerId, input())).replayed).toBe(false);
  });

  it("rejects expired prices, injected prices and historical ZEC budgets", async () => {
    await expect(createFundingQuote(communityId, pollId, ownerId, { ...input(), rateUsdPerZecE8: "1" })).rejects.toMatchObject({ code: "INVALID_QUOTE_INPUT" });
    market.get.mockResolvedValue({ ...freshPrice(), quotedAt: new Date(Date.now() - 300000) });
    await expect(createFundingQuote(communityId, pollId, ownerId, input())).rejects.toMatchObject({ code: "PRICE_UNAVAILABLE" });
    await prisma.poll.update({ where: { id: pollId }, data: { requestedAmountUsdCents: null, requestedAmountZat: 100000000n, contentHashVersion: "PROPOSAL_CONTENT_V2" } });
    await expect(createFundingQuote(communityId, pollId, ownerId, input())).rejects.toMatchObject({ code: "USD_FUNDING_REQUIRED" });
    expect(await prisma.proposalFundingQuote.count({ where: { pollId } })).toBe(0);
  });

  it("enforces immutable history and exact math at the database boundary", async () => {
    const saved = await createFundingQuote(communityId, pollId, ownerId, input());
    await expect(prisma.proposalFundingQuote.update({ where: { id: saved.quote.id }, data: { amountZat: 1n } })).rejects.toThrow("immutable");
    await expect(prisma.proposalFundingQuote.delete({ where: { id: saved.quote.id } })).rejects.toThrow("immutable");
    const price = freshPrice();
    await expect(prisma.proposalFundingQuote.create({ data: {
      pollId, actorId: ownerId, requestKey: randomUUID(), proposalHash, usdCents: 100n, ...price,
      amountZat: 1n, expiresAt: fundingQuoteExpiresAt(price.quotedAt)
    } })).rejects.toThrow("ProposalFundingQuote_values_check");
  });

  it("keeps archived history read-only and replays its existing record without obtaining a price", async () => {
    const request = input();
    const saved = await createFundingQuote(communityId, pollId, ownerId, request);
    await prisma.poll.update({ where: { id: pollId }, data: { status: "ARCHIVED" } });
    expect((await readFundingQuotes(communityId, pollId, ownerId)).canEstimate).toBe(false);
    await expect(createFundingQuote(communityId, pollId, ownerId, input())).rejects.toMatchObject({ code: "PROPOSAL_ARCHIVED" });
    expect((await createFundingQuote(communityId, pollId, ownerId, request)).quote).toEqual(saved.quote);
    expect(market.get).toHaveBeenCalledTimes(1);
  });

  it("returns an expired idempotent snapshot without refreshing its timestamp or value", async () => {
    const request = input();
    const quotedAt = new Date(Date.now() - 600_000);
    const saved = await prisma.proposalFundingQuote.create({ data: {
      pollId, actorId: ownerId, ...request, usdCents: 100n, rateUsdPerZecE8: 100000000n, amountZat: 100000000n,
      quotedAt, retrievedAt: quotedAt, expiresAt: fundingQuoteExpiresAt(quotedAt)
    } });
    const replay = await createFundingQuote(communityId, pollId, ownerId, request);
    expect(replay.replayed).toBe(true);
    expect(replay.quote.expiresAt).toBe(saved.expiresAt.toISOString());
    expect(replay.quote.amountZat).toBe("100000000");
    expect(market.get).not.toHaveBeenCalled();
  });
});
