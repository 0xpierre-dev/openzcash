// @vitest-environment node
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { beforeEach, afterEach, afterAll, describe, expect, it, vi } from "vitest";
import type { CreditReceiverConfig, CreditPaymentObservation } from "@/lib/domain/credit-purchases";

const { getReceiver, configured, preflight, observe } = vi.hoisted(() => ({ getReceiver: vi.fn(), configured: vi.fn(), preflight: vi.fn(), observe: vi.fn() }));
vi.mock("@/lib/zcash/credit-receivers", () => ({ getCreditReceiver: getReceiver, isCreditFundingConfigured: configured }));
vi.mock("@/lib/zcash/credit-payment-observer", () => ({ getCreditPaymentObserver: () => ({ preflight, observe }) }));

const databaseUrl = process.env.CREDITS_TEST_DATABASE_URL ?? process.env.TREASURY_TEST_DATABASE_URL;
if (databaseUrl) {
  const target = new URL(databaseUrl);
  if (target.hostname !== "127.0.0.1" || target.port !== (process.env.PARTICIPATE_TEST_PORT ?? "55438") || !["/community_treasury_tests", "/community_credit_tests"].includes(target.pathname)) {
    throw new Error("Credit purchase tests require a dedicated local test database");
  }
}
const prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? "postgresql://unused@127.0.0.1:1/unused" });
const client = prisma.$extends({ query: { creditPaymentReceipt: {
  async create({ args, query }) {
    if (args.data.txid === "f".repeat(64)) throw new Error("Test receipt failure after balance increment");
    return query(args);
  }
} } });
vi.mock("@/lib/db", () => ({ db: client }));
const { createCreditPurchase, checkCreditPurchase, readCreditPurchases, reconcileCreditPurchases } = await import("@/lib/services/credit-purchases");

let userId: string;
let communityId: string;
let receiver: CreditReceiverConfig;
let paymentTime: string;
let txid: string;

function observation(memo: string): CreditPaymentObservation {
  return { network: "mainnet", tipHeight: 105, tipHash: "a".repeat(64), scannedHeight: 105, candidates: [{
    txid, pool: "orchard", outputIndex: 1, accountId: receiver.accountId, amountZat: "10000", memo,
    blockHeight: 100, blockHash: "b".repeat(64), blockTime: paymentTime, confirmations: 6, canonical: true
  }] };
}
async function create() { return createCreditPurchase(userId, { communityId, requestKey: randomUUID() }); }
async function creditBalance() { return prisma.creditAccount.findUniqueOrThrow({ where: { communityId_userId: { communityId, userId } } }); }
function advance(ms = 16_000) { vi.setSystemTime(Date.now() + ms); }

describe.skipIf(!databaseUrl)("PostgreSQL confirmed credit purchases", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
    vi.stubEnv("DATABASE_URL", databaseUrl!); vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("WORKSPACE_PREVIEW", "false");
    const marker = randomUUID();
    const user = await prisma.user.create({ data: { nick: `purchase-${marker}`, passwordHash: "test-no-login-password", role: "USER" } });
    userId = user.id;
    const community = await prisma.community.create({ data: { name: "Purchase integration", slug: `purchase-${marker}`, createdById: userId, memberships: { create: { userId, role: "OWNER" } } } });
    communityId = community.id;
    receiver = { id: `receiver-${marker}`, communityId, network: "mainnet", accountId: randomUUID(), address: `u1${"q".repeat(100)}`,
      credits: 50, amountZat: "10000", requiredConfirmations: 6, expiresInMinutes: 10,
      walletRpc: { url: "http://127.0.0.1:1" }, chainRpc: { url: "http://127.0.0.1:2" } };
    txid = marker.replaceAll("-", "").repeat(2);
    paymentTime = new Date(Date.now() + 30_000).toISOString();
    getReceiver.mockImplementation(id => id === communityId ? receiver : null); configured.mockImplementation(id => id === communityId);
    preflight.mockResolvedValue({ height: 100 }); observe.mockImplementation(async (_receiver, request) => observation(request.memo));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it("creates concurrent retries once, freezes the price and atomically issues exactly one confirmed purchase", async () => {
    const input = { communityId, requestKey: randomUUID() };
    const [a, b] = await Promise.all([createCreditPurchase(userId, input), createCreditPurchase(userId, input)]);
    expect(a.id).toBe(b.id);
    receiver = { ...receiver, credits: 70, amountZat: "20000" };
    expect((await createCreditPurchase(userId, input)).amountZat).toBe("10000");
    const [first, second] = await Promise.all([checkCreditPurchase(userId, a.id), checkCreditPurchase(userId, a.id)]);
    expect([first.status, second.status]).toContain("CREDITED");
    expect((await creditBalance()).balance).toBe(50);
    expect(await prisma.creditPaymentReceipt.count({ where: { purchaseId: a.id } })).toBe(1);
    expect(await prisma.creditOperation.count({ where: { communityId, kind: "PURCHASE" } })).toBe(1);
    expect(await prisma.treasuryOperation.count({ where: { communityId } })).toBe(0);
    advance(); await checkCreditPurchase(userId, a.id);
    expect((await creditBalance()).balance).toBe(50);
  });

  it("permits only one open invoice per account and allows a new quote after the old unpaid deadline", async () => {
    const results = await Promise.allSettled([create(), create()]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { code: "CREDIT_PURCHASE_PENDING" } });
    advance(11 * 60_000);
    const next = await create();
    expect(next.status).toBe("PENDING");
    expect(await prisma.creditPurchase.count({ where: { communityId, status: "EXPIRED" } })).toBe(1);
  });

  it("rolls back balance and journal if receipt recording fails after the increment", async () => {
    const purchase = await create(); txid = "f".repeat(64);
    await expect(checkCreditPurchase(userId, purchase.id)).rejects.toThrow("Test receipt failure after balance increment");
    expect((await creditBalance()).balance).toBe(0);
    expect(await prisma.creditPaymentReceipt.count({ where: { purchaseId: purchase.id } })).toBe(0);
    expect(await prisma.creditOperation.count({ where: { communityId, kind: "PURCHASE" } })).toBe(0);
    expect((await prisma.creditPurchase.findUniqueOrThrow({ where: { id: purchase.id } })).status).toBe("PENDING");
  });

  it.each(["confirmation-arithmetic", "scan-behind-tip", "pre-invoice-block"])("rejects %s evidence at the database boundary and rolls back the full purchase", async invalid => {
    const purchase = await create();
    const account = await creditBalance();
    const blockHeight = invalid === "pre-invoice-block" ? 99 : 100;
    const tipHeight = invalid === "pre-invoice-block" ? 104 : invalid === "confirmation-arithmetic" ? 106 : 105;
    const scannedHeight = invalid === "scan-behind-tip" ? 104 : tipHeight;
    await expect(prisma.$transaction(async tx => {
      await tx.creditAccount.update({ where: { id: account.id }, data: { balance: { increment: 50 } } });
      await tx.creditPurchase.update({ where: { id: purchase.id }, data: { status: "CREDITED", creditedAt: new Date(),
        txid, blockHeight, blockHash: "b".repeat(64), blockTime: new Date(paymentTime), confirmations: 6 } });
      await tx.creditPaymentReceipt.create({ data: { purchaseId: purchase.id, network: "mainnet", txid, pool: "orchard", outputIndex: 1,
        receiverAccountId: receiver.accountId, amountZat: 10000n, memo: purchase.memo, blockHeight, blockHash: "b".repeat(64),
        blockTime: new Date(paymentTime), confirmations: 6, tipHeight, tipHash: "a".repeat(64), scannedHeight } });
      await tx.creditOperation.create({ data: { accountId: account.id, communityId, userId, kind: "PURCHASE", delta: 50,
        purchaseId: purchase.id, targetId: purchase.id, requestKey: `purchase:${purchase.id}`, payloadHash: "a".repeat(64), policyVersion: 1 } });
    })).rejects.toThrow(/CreditPaymentReceipt_evidence_check|do not match/);
    expect((await creditBalance()).balance).toBe(0);
    expect(await prisma.creditPaymentReceipt.count({ where: { purchaseId: purchase.id } })).toBe(0);
    expect(await prisma.creditOperation.count({ where: { purchaseId: purchase.id } })).toBe(0);
    expect((await prisma.creditPurchase.findUniqueOrThrow({ where: { id: purchase.id } })).status).toBe("PENDING");
  });

  it("finishes confirming after the deadline when block inclusion was within the quoted window", async () => {
    const purchase = await create();
    observe.mockImplementation(async (_receiver, request) => {
      const value = observation(request.memo); value.tipHeight = 100; value.scannedHeight = 100; value.candidates[0].confirmations = 1; return value;
    });
    expect((await checkCreditPurchase(userId, purchase.id)).status).toBe("CONFIRMING");
    advance(11 * 60_000); observe.mockImplementation(async (_receiver, request) => observation(request.memo));
    expect((await checkCreditPurchase(userId, purchase.id)).status).toBe("CREDITED");
    expect((await creditBalance()).balance).toBe(50);
  });

  it("retains an old invoice's observed payment while a newer invoice occupies the open slot, then credits it once final", async () => {
    const old = await create();
    advance(11 * 60_000);
    const next = await create();
    observe.mockImplementation(async (_receiver, request) => {
      const value = observation(request.memo); value.tipHeight = 100; value.scannedHeight = 100; value.candidates[0].confirmations = 1; return value;
    });
    expect(await checkCreditPurchase(userId, old.id)).toMatchObject({ status: "EXPIRED", txid, confirmations: 1 });
    expect((await prisma.creditPurchase.findUniqueOrThrow({ where: { id: next.id } })).status).toBe("PENDING");
    expect((await creditBalance()).balance).toBe(0);
    advance(); observe.mockImplementation(async (_receiver, request) => observation(request.memo));
    expect((await checkCreditPurchase(userId, old.id)).status).toBe("CREDITED");
    expect((await creditBalance()).balance).toBe(50);
    expect((await prisma.creditPurchase.findUniqueOrThrow({ where: { id: next.id } })).status).toBe("PENDING");
    expect(await prisma.creditOperation.count({ where: { communityId, kind: "PURCHASE" } })).toBe(1);
  });

  it.each(["partial", "excess", "multiple", "late"])("holds %s payment for review without issuing any credits", async kind => {
    const purchase = await create();
    observe.mockImplementation(async (_receiver, request) => {
      const value = observation(request.memo);
      if (kind === "partial") value.candidates[0].amountZat = "9999";
      if (kind === "excess") value.candidates[0].amountZat = "10001";
      if (kind === "multiple") value.candidates.push({ ...value.candidates[0], outputIndex: 2 });
      if (kind === "late") value.candidates[0].blockTime = new Date(new Date(purchase.expiresAt).getTime() + 1).toISOString();
      return value;
    });
    expect((await checkCreditPurchase(userId, purchase.id)).status).toBe("REVIEW");
    expect((await creditBalance()).balance).toBe(0);
    expect(await prisma.creditOperation.count({ where: { communityId, kind: "PURCHASE" } })).toBe(0);
  });

  it("puts a credited account on review if confirmation evidence disappears without negative clawback or second issuance", async () => {
    const purchase = await create(); await checkCreditPurchase(userId, purchase.id);
    advance(); observe.mockImplementation(async () => ({ network: "mainnet", tipHeight: 105, tipHash: "a".repeat(64), scannedHeight: 105, candidates: [] }));
    expect((await checkCreditPurchase(userId, purchase.id)).status).toBe("REVIEW");
    expect(await creditBalance()).toMatchObject({ balance: 50, paymentReview: true });
    advance(); await checkCreditPurchase(userId, purchase.id);
    expect(await prisma.creditOperation.count({ where: { communityId, kind: "PURCHASE" } })).toBe(1);
    expect(observe).toHaveBeenCalledTimes(2);
  });

  it("does not use provider errors as absence or duplicate the lease-controlled payment check", async () => {
    const purchase = await create();
    observe.mockRejectedValue(new Error("Provider is offline"));
    await expect(checkCreditPurchase(userId, purchase.id)).rejects.toMatchObject({ code: "CREDIT_PAYMENT_OBSERVER_UNAVAILABLE" });
    expect((await prisma.creditPurchase.findUniqueOrThrow({ where: { id: purchase.id } })).status).toBe("PENDING");
    await checkCreditPurchase(userId, purchase.id);
    expect(observe).toHaveBeenCalledTimes(1);
    expect((await creditBalance()).balance).toBe(0);
  });

  it("preserves owned history after access removal, denies other users and blocks demo mixing before preflight", async () => {
    const purchase = await create();
    await prisma.communityMembership.update({ where: { communityId_userId: { communityId, userId } }, data: { status: "DISABLED" } });
    expect((await readCreditPurchases(userId, communityId)).purchases[0].id).toBe(purchase.id);
    const other = await prisma.user.create({ data: { nick: `outsider-${randomUUID()}`, passwordHash: "test-no-login", role: "ADMIN" } });
    await expect(checkCreditPurchase(other.id, purchase.id)).rejects.toMatchObject({ code: "CREDIT_PURCHASE_NOT_FOUND" });
    await expect(readCreditPurchases(other.id, communityId)).rejects.toMatchObject({ code: "CREDIT_PURCHASE_NOT_FOUND" });
    await expect(createCreditPurchase(userId, { communityId, requestKey: randomUUID() })).rejects.toMatchObject({ code: "CREDIT_PURCHASE_NOT_FOUND" });
    expect((await createCreditPurchase(userId, { communityId, requestKey: (await prisma.creditPurchase.findUniqueOrThrow({ where: { id: purchase.id } })).requestKey })).id).toBe(purchase.id);
    await expect(prisma.$transaction(async tx => {
      await tx.creditAccount.update({ where: { id: (await creditBalance()).id }, data: { balance: { increment: 25 } } });
      await tx.creditOperation.create({ data: { accountId: (await creditBalance()).id, communityId, userId, kind: "PREVIEW_GRANT", delta: 25,
        requestKey: "preview-grant:v1", payloadHash: "a".repeat(64), policyVersion: 1 } });
    })).rejects.toThrow(/cannot receive demo/);
  });

  it("enforces immutable quote/receipt history and global output identity", async () => {
    const purchase = await create(); await checkCreditPurchase(userId, purchase.id);
    await expect(prisma.creditPurchase.update({ where: { id: purchase.id }, data: { amountZat: 1n } })).rejects.toThrow(/immutable/);
    await expect(prisma.creditPurchase.delete({ where: { id: purchase.id } })).rejects.toThrow(/cannot be deleted/);
    const receipt = await prisma.creditPaymentReceipt.findUniqueOrThrow({ where: { purchaseId: purchase.id } });
    await expect(prisma.creditPaymentReceipt.update({ where: { id: receipt.id }, data: { amountZat: 1n } })).rejects.toThrow(/append-only/);
    advance(); const next = await create();
    expect((await checkCreditPurchase(userId, next.id)).status).toBe("REVIEW");
    expect((await creditBalance()).balance).toBe(50);
    expect(await prisma.creditPaymentReceipt.count({ where: { network: "mainnet", txid } })).toBe(1);
    const jobs = await reconcileCreditPurchases(100);
    expect(jobs.processed).toBeGreaterThan(0);
  });
});
