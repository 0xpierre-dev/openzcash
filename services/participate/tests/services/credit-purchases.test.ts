import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { CreditPurchase } from "@prisma/client";
import type { CreditReceiverConfig, CreditPaymentObservation } from "@/lib/domain/credit-purchases";

const { tx, receiverConfig, fundingConfigured, preflight, observe } = vi.hoisted(() => ({
  receiverConfig: vi.fn(), fundingConfigured: vi.fn(), preflight: vi.fn(), observe: vi.fn(),
  tx: {
    user: { findFirst: vi.fn() }, community: { findFirst: vi.fn(), findUniqueOrThrow: vi.fn() },
    creditAccount: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), upsert: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    creditOperation: { findFirst: vi.fn(), create: vi.fn() },
    creditPurchase: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    creditPaymentReceipt: { findUnique: vi.fn(), create: vi.fn() }
  }
}));
vi.mock("@/lib/db", () => ({ db: { ...tx, $transaction: vi.fn(async callback => callback(tx)) } }));
vi.mock("@/lib/zcash/credit-receivers", () => ({ getCreditReceiver: receiverConfig, isCreditFundingConfigured: fundingConfigured }));
vi.mock("@/lib/zcash/credit-payment-observer", () => ({ getCreditPaymentObserver: () => ({ preflight, observe }) }));
import { createCreditPurchase, readCreditPurchases, checkCreditPurchase, reconcileCreditPurchases } from "@/lib/services/credit-purchases";

const receiver: CreditReceiverConfig = {
  id: "receiver-a", communityId: "community-a", network: "mainnet", accountId: "00000000-0000-4000-8000-000000000001",
  address: `u1${"q".repeat(100)}`, credits: 50, amountZat: "10000", requiredConfirmations: 6, expiresInMinutes: 30,
  walletRpc: { url: "http://127.0.0.1:1", user: "private-user", password: "private-password" }, chainRpc: { url: "http://127.0.0.1:2" }
};
let purchase: CreditPurchase;
let observation: CreditPaymentObservation;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WORKSPACE_PREVIEW", "false");
  const createdAt = new Date();
  purchase = {
    id: "purchase-a", creditAccountId: "account-a", communityId: "community-a", userId: "alice", requestKey: "purchase-request-001",
    receiverId: receiver.id, receiverAccountId: receiver.accountId, network: "mainnet", address: receiver.address,
    amountZat: 10000n, credits: 50, requiredConfirmations: 6, memo: "CREDIT:opaque-invoice-memo", startHeight: 100,
    createdAt, updatedAt: createdAt, expiresAt: new Date(createdAt.getTime() + 1_800_000), status: "PENDING",
    txid: null, confirmations: 0, blockHeight: null, blockHash: null, blockTime: null,
    lastCheckedAt: null, checkLeaseKey: null, checkLeaseUntil: null, creditedAt: null, reviewReason: null
  };
  observation = { network: "mainnet", tipHeight: 105, tipHash: "a".repeat(64), scannedHeight: 105, candidates: [{
    txid: "c".repeat(64), pool: "orchard", outputIndex: 1, accountId: receiver.accountId, amountZat: "10000", memo: purchase.memo,
    blockHeight: 100, blockHash: "b".repeat(64), blockTime: createdAt.toISOString(), confirmations: 6, canonical: true
  }] };
  receiverConfig.mockReturnValue(receiver); fundingConfigured.mockReturnValue(true);
  preflight.mockResolvedValue({ height: 100 }); observe.mockImplementation(async () => observation);
  tx.user.findFirst.mockResolvedValue({ id: "alice" }); tx.community.findFirst.mockResolvedValue({ id: "community-a" });
  tx.community.findUniqueOrThrow.mockResolvedValue({ participationPolicyVersion: 2 });
  tx.creditAccount.findUnique.mockResolvedValue({ id: "account-a", paymentReview: false });
  tx.creditAccount.findUniqueOrThrow.mockResolvedValue({ id: "account-a", paymentReview: false });
  tx.creditAccount.upsert.mockResolvedValue({ id: "account-a" }); tx.creditAccount.updateMany.mockResolvedValue({ count: 1 });
  tx.creditAccount.update.mockResolvedValue({}); tx.creditOperation.findFirst.mockResolvedValue(null); tx.creditOperation.create.mockResolvedValue({ id: "operation-a" });
  tx.creditPurchase.findUnique.mockResolvedValue(null); tx.creditPurchase.findUniqueOrThrow.mockImplementation(async () => purchase);
  tx.creditPurchase.findFirst.mockImplementation(async ({ where }) => where.id ? purchase : null);
  tx.creditPurchase.findMany.mockResolvedValue([]);
  tx.creditPurchase.create.mockImplementation(async ({ data }) => ({ ...purchase, ...data }));
  tx.creditPurchase.updateMany.mockImplementation(async ({ data }) => data.checkLeaseKey ? { count: 1 } : { count: 0 });
  tx.creditPurchase.update.mockImplementation(async ({ data }) => ({ ...purchase, ...data }));
  tx.creditPaymentReceipt.findUnique.mockResolvedValue(null); tx.creditPaymentReceipt.create.mockResolvedValue({ id: "receipt-a" });
});
afterEach(() => vi.unstubAllEnvs());

describe("server-owned credit purchase quotes", () => {
  it("uses the DAO receiver quote after preflight and never exposes RPC credentials", async () => {
    const result = await createCreditPurchase("alice", { communityId: "community-a", requestKey: "purchase-request-001" });
    expect(result).toMatchObject({ credits: 50, amountZat: "10000", amountZec: "0.00010000", address: receiver.address, network: "mainnet" });
    expect(result.memo).toMatch(/^CREDIT:v1:[a-f0-9]{48}$/);
    expect(result.paymentUri).toContain("zcash:");
    expect(preflight).toHaveBeenCalledWith(receiver);
    expect(tx.creditOperation.create).not.toHaveBeenCalled();
    expect(tx.creditAccount.updateMany).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("private-password");
    expect(JSON.stringify(result)).not.toContain("private-user");
    expect(result.memo).not.toContain("alice");
  });

  it("replays the original snapshot before receiver/preflight and current entitlement", async () => {
    tx.creditPurchase.findUnique.mockResolvedValue(purchase);
    tx.community.findFirst.mockResolvedValue(null); fundingConfigured.mockReturnValue(false);
    const result = await createCreditPurchase("alice", { communityId: "community-a", requestKey: "purchase-request-001" });
    expect(result.credits).toBe(50); expect(result.amountZat).toBe("10000"); expect(result.paymentUri).toBeNull();
    expect(preflight).not.toHaveBeenCalled(); expect(tx.creditPurchase.create).not.toHaveBeenCalled();
  });

  it("rejects inactive, foreign, demo and reviewed accounts before making any wallet request", async () => {
    tx.user.findFirst.mockResolvedValue(null);
    await expect(createCreditPurchase("alice", { communityId: "community-a", requestKey: "purchase-request-001" })).rejects.toMatchObject({ code: "CREDIT_PURCHASE_NOT_FOUND" });
    tx.user.findFirst.mockResolvedValue({ id: "alice" }); tx.community.findFirst.mockResolvedValue(null);
    await expect(createCreditPurchase("alice", { communityId: "community-b", requestKey: "purchase-request-001" })).rejects.toMatchObject({ code: "CREDIT_PURCHASE_NOT_FOUND" });
    tx.community.findFirst.mockResolvedValue({ id: "community-a" }); tx.creditOperation.findFirst.mockResolvedValue({ id: "demo" });
    await expect(createCreditPurchase("alice", { communityId: "community-a", requestKey: "purchase-request-001" })).rejects.toMatchObject({ code: "CREDIT_DEMO_ACCOUNT" });
    tx.creditOperation.findFirst.mockResolvedValue(null); tx.creditAccount.findUnique.mockResolvedValue({ id: "account-a", paymentReview: true });
    await expect(createCreditPurchase("alice", { communityId: "community-a", requestKey: "purchase-request-001" })).rejects.toMatchObject({ code: "CREDIT_ACCOUNT_PAYMENT_REVIEW" });
    expect(preflight).not.toHaveBeenCalled();
  });

  it("does not create a quote when funding/preflight is unavailable and rejects client price overrides", async () => {
    fundingConfigured.mockReturnValue(false);
    await expect(createCreditPurchase("alice", { communityId: "community-a", requestKey: "purchase-request-001" })).rejects.toMatchObject({ code: "CREDIT_RECEIVER_UNAVAILABLE" });
    fundingConfigured.mockReturnValue(true); preflight.mockRejectedValue(new Error("private RPC details"));
    await expect(createCreditPurchase("alice", { communityId: "community-a", requestKey: "purchase-request-001" })).rejects.toMatchObject({ code: "CREDIT_PAYMENT_OBSERVER_UNAVAILABLE" });
    await expect(createCreditPurchase("alice", { communityId: "community-a", requestKey: "purchase-request-001", amountZat: "1" })).rejects.toMatchObject({ code: "INVALID_PURCHASE_INPUT" });
    expect(tx.creditPurchase.create).not.toHaveBeenCalled();
  });

  it("expires only old unobserved pending requests to allow a new invoice while retaining their reconciliation history", async () => {
    await createCreditPurchase("alice", { communityId: "community-a", requestKey: "purchase-request-001" });
    expect(tx.creditPurchase.updateMany).toHaveBeenCalledWith({ where: {
      communityId: "community-a", userId: "alice", status: "PENDING", txid: null, expiresAt: { lte: expect.any(Date) }
    }, data: { status: "EXPIRED" } });
  });
});

describe("confirmed receiving output and credit issuance", () => {
  it("records exactly the quote, receipt and journal in the same transaction after sufficient canonical confirmations", async () => {
    const result = await checkCreditPurchase("alice", "purchase-a");
    expect(result.status).toBe("CREDITED"); expect(result.confirmations).toBe(6);
    expect(tx.creditAccount.updateMany).toHaveBeenCalledWith({ where: { id: "account-a", paymentReview: false, balance: { lte: 999999950 } }, data: { balance: { increment: 50 } } });
    expect(tx.creditOperation.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kind: "PURCHASE", delta: 50, purchaseId: "purchase-a", targetId: "purchase-a", userId: "alice", communityId: "community-a" }) }));
    expect(tx.creditPaymentReceipt.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ network: "mainnet", txid: "c".repeat(64), pool: "orchard", outputIndex: 1, amountZat: 10000n, blockHash: "b".repeat(64), scannedHeight: 105 }) }));
  });

  it("leaves an observed unconfirmed payment pending finalization without issuing credits", async () => {
    observation.candidates[0] = { ...observation.candidates[0], blockHeight: null, blockHash: null, blockTime: null, confirmations: 0, canonical: false };
    expect((await checkCreditPurchase("alice", "purchase-a")).status).toBe("CONFIRMING");
    expect(tx.creditAccount.updateMany).not.toHaveBeenCalled(); expect(tx.creditPaymentReceipt.create).not.toHaveBeenCalled();
  });

  it.each(["partial", "excess", "ambiguous", "late", "foreign-account"])("routes %s payments to review without credit", async kind => {
    if (kind === "partial") observation.candidates[0].amountZat = "9999";
    if (kind === "excess") observation.candidates[0].amountZat = "10001";
    if (kind === "ambiguous") observation.candidates.push({ ...observation.candidates[0], outputIndex: 2 });
    if (kind === "late") observation.candidates[0].blockTime = new Date(purchase.expiresAt.getTime() + 1).toISOString();
    if (kind === "foreign-account") observation.candidates[0].accountId = "another-account";
    expect((await checkCreditPurchase("alice", "purchase-a")).status).toBe("REVIEW");
    expect(tx.creditAccount.updateMany).not.toHaveBeenCalled(); expect(tx.creditOperation.create).not.toHaveBeenCalled();
  });

  it("does not mistake provider errors, unsynchronized scans or conflicting duplicate output evidence for payment absence", async () => {
    observe.mockRejectedValueOnce(new Error("Private provider error"));
    await expect(checkCreditPurchase("alice", "purchase-a")).rejects.toMatchObject({ code: "CREDIT_PAYMENT_OBSERVER_UNAVAILABLE" });
    observation.scannedHeight = 104;
    await expect(checkCreditPurchase("alice", "purchase-a")).rejects.toMatchObject({ code: "CREDIT_PAYMENT_OBSERVER_UNAVAILABLE" });
    observation.scannedHeight = 105; observation.candidates.push({ ...observation.candidates[0], amountZat: "10001" });
    await expect(checkCreditPurchase("alice", "purchase-a")).rejects.toMatchObject({ code: "CREDIT_PAYMENT_OBSERVER_UNAVAILABLE" });
    expect(tx.creditAccount.updateMany).not.toHaveBeenCalled(); expect(tx.creditPurchase.update).not.toHaveBeenCalled();
  });

  it("holds a previously credited account when receipt evidence disappears and never claws back or grants again", async () => {
    purchase.status = "CREDITED"; purchase.creditedAt = new Date(); purchase.txid = "c".repeat(64);
    observation.candidates = [];
    expect((await checkCreditPurchase("alice", "purchase-a")).status).toBe("REVIEW");
    expect(tx.creditAccount.update).toHaveBeenCalledWith({ where: { id: "account-a" }, data: { paymentReview: true } });
    expect(tx.creditAccount.updateMany).not.toHaveBeenCalled(); expect(tx.creditOperation.create).not.toHaveBeenCalled();
  });

  it.each(["absent", "orphan"])("holds credited funds after a fully scanned reorg below invoice creation height with %s evidence", async evidence => {
    purchase.status = "CREDITED"; purchase.creditedAt = new Date(); purchase.txid = "c".repeat(64);
    observation.tipHeight = 98; observation.scannedHeight = 98;
    if (evidence === "absent") observation.candidates = [];
    else observation.candidates[0] = { ...observation.candidates[0], canonical: false, confirmations: 0 };
    expect((await checkCreditPurchase("alice", "purchase-a")).status).toBe("REVIEW");
    expect(tx.creditAccount.update).toHaveBeenCalledWith({ where: { id: "account-a" }, data: { paymentReview: true } });
    expect(tx.creditAccount.updateMany).not.toHaveBeenCalled(); expect(tx.creditOperation.create).not.toHaveBeenCalled();
  });

  it("never first-mints from a block below the immutable invoice creation height after a reorg", async () => {
    observation.tipHeight = 98; observation.scannedHeight = 98;
    observation.candidates[0] = { ...observation.candidates[0], blockHeight: 93, confirmations: 6 };
    await expect(checkCreditPurchase("alice", "purchase-a")).rejects.toMatchObject({ code: "CREDIT_PAYMENT_OBSERVER_UNAVAILABLE" });
    expect(tx.creditAccount.updateMany).not.toHaveBeenCalled(); expect(tx.creditPaymentReceipt.create).not.toHaveBeenCalled();
    expect(tx.creditOperation.create).not.toHaveBeenCalled();
  });

  it("fails closed on finality arithmetic inconsistency even for an already credited purchase", async () => {
    purchase.status = "CREDITED"; purchase.creditedAt = new Date();
    observation.candidates[0].confirmations = 7;
    await expect(checkCreditPurchase("alice", "purchase-a")).rejects.toMatchObject({ code: "CREDIT_PAYMENT_OBSERVER_UNAVAILABLE" });
    expect(tx.creditAccount.updateMany).not.toHaveBeenCalled();
  });

  it("checks ownership and a persistent lease before RPC, and does not query a replaced receiving wallet", async () => {
    tx.creditPurchase.findFirst.mockResolvedValue(null);
    await expect(checkCreditPurchase("bob", "purchase-a")).rejects.toMatchObject({ code: "CREDIT_PURCHASE_NOT_FOUND" });
    expect(observe).not.toHaveBeenCalled();
    tx.creditPurchase.findFirst.mockResolvedValue(purchase); tx.creditPurchase.updateMany.mockResolvedValue({ count: 0 });
    expect((await checkCreditPurchase("alice", "purchase-a")).status).toBe("PENDING");
    expect(observe).not.toHaveBeenCalled();
    tx.creditPurchase.updateMany.mockResolvedValue({ count: 1 }); receiverConfig.mockReturnValue({ ...receiver, id: "new-receiver" });
    expect((await checkCreditPurchase("alice", "purchase-a")).status).toBe("REVIEW");
    expect(observe).not.toHaveBeenCalled();
  });

  it("lists only the caller's own invoices and includes credited/expired states in server reconciliation", async () => {
    tx.creditPurchase.findMany.mockResolvedValue([purchase]);
    const result = await readCreditPurchases("alice", "community-a");
    expect(result.purchases).toHaveLength(1);
    expect(tx.creditPurchase.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "alice", communityId: "community-a" } }));
    tx.creditPurchase.findMany.mockResolvedValue([]);
    await reconcileCreditPurchases();
    expect(tx.creditPurchase.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { status: { in: ["PENDING", "CONFIRMING", "CREDITED", "EXPIRED"] } } }));
  });
});
