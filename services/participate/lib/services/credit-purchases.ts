import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Prisma, type CreditPurchase } from "@prisma/client";
import { db } from "@/lib/db";
import { MAX_CREDIT_BALANCE } from "@/lib/domain/participation-credits";
import {
  CreditPurchaseError, createCreditPurchaseInputSchema, creditZatToZec,
  type CreditPurchaseView, type CreditPurchasesView, type CreditReceiverConfig,
  type CreditPaymentObservation, type CreditPaymentCandidate
} from "@/lib/domain/credit-purchases";
import { accessibleCreditCommunityWhere } from "@/lib/services/participation-credits";
import { getCreditReceiver, isCreditFundingConfigured } from "@/lib/zcash/credit-receivers";
import { getCreditPaymentObserver } from "@/lib/zcash/credit-payment-observer";
import { buildZip321Uri } from "@/lib/zcash/zip321";
import { pilotReceiverNotice } from "@/lib/zcash/pilot-credit-receiver";
import { publicPilotRequested } from "@/lib/auth/public-pilot-policy";

export { CreditPurchaseError } from "@/lib/domain/credit-purchases";
const CHECK_INTERVAL_MS = 15_000;
const LEASE_MS = 120_000;
const hex = /^[a-f0-9]{64}$/;

function failure(code: string, status: 400 | 403 | 404 | 409 | 429 | 503, message: string): never {
  throw new CreditPurchaseError(message, status, code);
}
function missing(): never { return failure("CREDIT_PURCHASE_NOT_FOUND", 404, "Purchase not found"); }

async function serializable<T>(run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return await db.$transaction(run, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) {
        if (attempt < 3) continue;
        return failure("CREDIT_PURCHASE_CONCURRENT_UPDATE", 409, "The purchase changed. Retry the same request");
      }
      throw error;
    }
  }
  throw new Error("Unreachable purchase retry");
}

async function activeUser(tx: Prisma.TransactionClient, userId: string) {
  if (!userId || !await tx.user.findFirst({ where: { id: userId, status: "ACTIVE" }, select: { id: true } })) return missing();
}
async function currentEntitlement(tx: Prisma.TransactionClient, userId: string, communityId: string) {
  if (!await tx.community.findFirst({ where: { id: communityId, ...accessibleCreditCommunityWhere(userId, false) }, select: { id: true } })) return missing();
}

function sameReceiver(purchase: CreditPurchase, receiver: CreditReceiverConfig) {
  return purchase.receiverId === receiver.id && purchase.communityId === receiver.communityId
    && purchase.network === receiver.network && purchase.receiverAccountId === receiver.accountId && purchase.address === receiver.address;
}
function usableReceiver(communityId: string): CreditReceiverConfig | null {
  if (publicPilotRequested() || process.env.WORKSPACE_PREVIEW === "true" || !isCreditFundingConfigured(communityId)) return null;
  return getCreditReceiver(communityId);
}
function view(purchase: CreditPurchase): CreditPurchaseView {
  let receiver: CreditReceiverConfig | null = null;
  try { receiver = usableReceiver(purchase.communityId); } catch { /* Keep owned history readable when a receiver is disabled. */ }
  const canPay = purchase.status === "PENDING" && purchase.expiresAt.getTime() > Date.now() && receiver && sameReceiver(purchase, receiver);
  return {
    id: purchase.id, communityId: purchase.communityId, network: purchase.network,
    credits: purchase.credits, amountZat: purchase.amountZat.toString(), amountZec: creditZatToZec(purchase.amountZat),
    address: purchase.address, memo: purchase.memo,
    paymentUri: canPay ? buildZip321Uri({ address: purchase.address, amountZec: creditZatToZec(purchase.amountZat), memo: purchase.memo }) : null,
    status: purchase.status, confirmations: purchase.confirmations, requiredConfirmations: purchase.requiredConfirmations,
    expiresAt: purchase.expiresAt.toISOString(), createdAt: purchase.createdAt.toISOString(), txid: purchase.txid
  };
}

async function ensureRealAccount(tx: Prisma.TransactionClient, userId: string, communityId: string) {
  const account = await tx.creditAccount.findUnique({ where: { communityId_userId: { communityId, userId } }, select: { id: true, paymentReview: true } });
  if (account?.paymentReview) return failure("CREDIT_ACCOUNT_PAYMENT_REVIEW", 409, "This credit account requires payment review");
  if (account && await tx.creditOperation.findFirst({ where: { accountId: account.id, kind: "PREVIEW_GRANT" }, select: { id: true } })) {
    return failure("CREDIT_DEMO_ACCOUNT", 409, "Demo credit accounts cannot receive real purchases");
  }
  return account;
}

async function expireUnobservedPending(tx: Prisma.TransactionClient, userId: string, communityId: string) {
  // Deadline expiry stops displaying a payment request; it does not prove there
  // was no payment. Expired orders remain eligible for later reconciliation.
  await tx.creditPurchase.updateMany({ where: { communityId, userId, status: "PENDING", txid: null, expiresAt: { lte: new Date() } }, data: { status: "EXPIRED" } });
}

export async function readCreditPurchases(userId: string, communityId?: string): Promise<CreditPurchasesView> {
  if (communityId !== undefined && (!communityId.trim() || communityId.length > 128)) return failure("INVALID_PURCHASE_INPUT", 400, "Choose one community");
  const purchases = await db.$transaction(async tx => {
    await activeUser(tx, userId);
    if (communityId && !await tx.community.findFirst({
      where: { id: communityId, OR: [...accessibleCreditCommunityWhere(userId, false).OR as Prisma.CommunityWhereInput[], { creditPurchases: { some: { userId } } }] }, select: { id: true }
    })) return missing();
    return tx.creditPurchase.findMany({ where: { userId, ...(communityId ? { communityId } : {}) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50 });
  });
  let receiver: CreditReceiverConfig | null = null;
  if (communityId) { try { receiver = usableReceiver(communityId); } catch { /* An invalid receiver never enables a payment request. */ } }
  return {
    funding: { configured: Boolean(receiver), network: receiver?.network ?? null,
      ...(!publicPilotRequested() && !receiver && communityId ? { preparedReceiver: pilotReceiverNotice(communityId) } : {}),
      package: receiver ? { credits: receiver.credits, amountZat: receiver.amountZat, amountZec: creditZatToZec(receiver.amountZat) } : null },
    purchases: purchases.map(view)
  };
}

export async function createCreditPurchase(userId: string, input: unknown): Promise<CreditPurchaseView> {
  const parsed = createCreditPurchaseInputSchema.safeParse(input);
  if (!parsed.success) return failure("INVALID_PURCHASE_INPUT", 400, "Choose a community and request key");
  if (publicPilotRequested()) return failure("CREDIT_DEMO_ONLY", 403, "The public pilot uses free credits. Real purchases are disabled");
  const { communityId, requestKey } = parsed.data;
  const replay = await db.$transaction(async tx => {
    await activeUser(tx, userId);
    await expireUnobservedPending(tx, userId, communityId);
    const existing = await tx.creditPurchase.findUnique({ where: { communityId_userId_requestKey: { communityId, userId, requestKey } } });
    if (existing) return existing;
    await currentEntitlement(tx, userId, communityId);
    await ensureRealAccount(tx, userId, communityId);
    if (await tx.creditPurchase.findFirst({ where: { communityId, userId, status: { in: ["PENDING", "CONFIRMING"] } }, select: { id: true } })) {
      return failure("CREDIT_PURCHASE_PENDING", 409, "An existing purchase is still awaiting payment confirmation");
    }
    return null;
  });
  if (replay) return view(replay);
  const receiver = usableReceiver(communityId);
  if (!receiver) return failure("CREDIT_RECEIVER_UNAVAILABLE", 503, "The DAO receiving wallet is unavailable");
  let height: number;
  try { height = (await getCreditPaymentObserver().preflight(receiver)).height; }
  catch { return failure("CREDIT_PAYMENT_OBSERVER_UNAVAILABLE", 503, "The receiving wallet could not be verified. No purchase was created"); }
  if (!Number.isSafeInteger(height) || height < 0) return failure("CREDIT_PAYMENT_OBSERVER_UNAVAILABLE", 503, "The receiving wallet could not be verified");
  const createdAt = new Date();
  return view(await serializable(async tx => {
    await activeUser(tx, userId);
    await expireUnobservedPending(tx, userId, communityId);
    const existing = await tx.creditPurchase.findUnique({ where: { communityId_userId_requestKey: { communityId, userId, requestKey } } });
    if (existing) return existing;
    await currentEntitlement(tx, userId, communityId);
    await ensureRealAccount(tx, userId, communityId);
    if (await tx.creditPurchase.findFirst({ where: { communityId, userId, status: { in: ["PENDING", "CONFIRMING"] } }, select: { id: true } })) {
      return failure("CREDIT_PURCHASE_PENDING", 409, "An existing purchase is still awaiting payment confirmation");
    }
    const account = await tx.creditAccount.upsert({ where: { communityId_userId: { communityId, userId } }, create: { communityId, userId }, update: {}, select: { id: true } });
    return tx.creditPurchase.create({ data: {
      creditAccountId: account.id, communityId, userId, requestKey,
      receiverId: receiver.id, receiverAccountId: receiver.accountId, network: receiver.network, address: receiver.address,
      amountZat: BigInt(receiver.amountZat), credits: receiver.credits, requiredConfirmations: receiver.requiredConfirmations,
      memo: `CREDIT:v1:${randomBytes(24).toString("hex")}`, startHeight: height, createdAt,
      expiresAt: new Date(createdAt.getTime() + receiver.expiresInMinutes * 60_000)
    } });
  }));
}

async function review(tx: Prisma.TransactionClient, purchase: CreditPurchase, reason: string) {
  if (purchase.creditedAt) await tx.creditAccount.update({ where: { id: purchase.creditAccountId }, data: { paymentReview: true } });
  return tx.creditPurchase.update({ where: { id: purchase.id }, data: { status: "REVIEW", reviewReason: reason, checkLeaseKey: null, checkLeaseUntil: null } });
}

function validateObservation(observation: CreditPaymentObservation, purchase: CreditPurchase) {
  if (observation.network !== purchase.network || !Number.isSafeInteger(observation.tipHeight) || observation.tipHeight < 0
    || !Number.isSafeInteger(observation.scannedHeight) || observation.scannedHeight < observation.tipHeight || !hex.test(observation.tipHash)) {
    return failure("CREDIT_PAYMENT_OBSERVER_UNAVAILABLE", 503, "Payment verification is incomplete. No credits were changed");
  }
  for (const candidate of observation.candidates) {
    if (!hex.test(candidate.txid) || !["sapling", "orchard"].includes(candidate.pool) || !Number.isSafeInteger(candidate.outputIndex) || candidate.outputIndex < 0
      || !/^[1-9][0-9]*$/.test(candidate.amountZat) || BigInt(candidate.amountZat) > 2_100_000_000_000_000n
      || !Number.isSafeInteger(candidate.confirmations) || candidate.confirmations < 0
      || (candidate.blockHeight !== null && (!Number.isSafeInteger(candidate.blockHeight) || candidate.blockHeight < 0 || (candidate.canonical && candidate.blockHeight > observation.tipHeight)))
      || (candidate.blockHash !== null && !hex.test(candidate.blockHash))
      || (candidate.blockTime !== null && !Number.isFinite(new Date(candidate.blockTime).getTime()))
      || (candidate.canonical && candidate.blockHeight !== null && candidate.confirmations !== observation.tipHeight - candidate.blockHeight + 1)) {
      return failure("CREDIT_PAYMENT_OBSERVER_UNAVAILABLE", 503, "Payment verification is incomplete. No credits were changed");
    }
  }
}

async function applyObservation(tx: Prisma.TransactionClient, purchase: CreditPurchase, observation: CreditPaymentObservation) {
  validateObservation(observation, purchase);
  const matched = observation.candidates.filter(candidate => candidate.memo === purchase.memo);
  const seen = new Map<string, CreditPaymentCandidate>();
  for (const candidate of matched) {
    const identity = `${candidate.txid}:${candidate.pool}:${candidate.outputIndex}`;
    const previous = seen.get(identity);
    if (previous && (previous.accountId !== candidate.accountId || previous.amountZat !== candidate.amountZat
      || previous.memo !== candidate.memo || previous.blockHeight !== candidate.blockHeight || previous.blockHash !== candidate.blockHash
      || previous.blockTime !== candidate.blockTime || previous.confirmations !== candidate.confirmations || previous.canonical !== candidate.canonical)) {
      return failure("CREDIT_PAYMENT_OBSERVER_UNAVAILABLE", 503, "Payment evidence is inconsistent. No credits were changed");
    }
    seen.set(identity, candidate);
  }
  const candidates = [...seen.values()];
  if (candidates.length > 1) return review(tx, purchase, "AMBIGUOUS_PAYMENT");
  const candidate = candidates[0];
  if (!candidate) {
    if (purchase.creditedAt) return review(tx, purchase, "CREDITED_PAYMENT_MISSING");
    return tx.creditPurchase.update({ where: { id: purchase.id }, data: {
      status: purchase.expiresAt.getTime() <= Date.now() ? "EXPIRED" : purchase.status === "CONFIRMING" ? "CONFIRMING" : "PENDING",
      checkLeaseKey: null, checkLeaseUntil: null
    } });
  }
  if (candidate.accountId !== purchase.receiverAccountId || BigInt(candidate.amountZat) !== purchase.amountZat) return review(tx, purchase, "PAYMENT_QUOTE_MISMATCH");
  if (candidate.blockTime && new Date(candidate.blockTime).getTime() > purchase.expiresAt.getTime()) return review(tx, purchase, "PAYMENT_AFTER_EXPIRY");
  if (!candidate.blockTime && purchase.expiresAt.getTime() <= Date.now()) return review(tx, purchase, "UNCONFIRMED_PAYMENT_AFTER_EXPIRY");
  const evidence = { txid: candidate.txid, confirmations: candidate.confirmations, blockHeight: candidate.blockHeight,
    blockHash: candidate.blockHash, blockTime: candidate.blockTime ? new Date(candidate.blockTime) : null, checkLeaseKey: null, checkLeaseUntil: null };
  if (purchase.creditedAt) {
    const receipt = await tx.creditPaymentReceipt.findUnique({ where: { purchaseId: purchase.id } });
    if (!receipt || receipt.txid !== candidate.txid || receipt.pool !== candidate.pool || receipt.outputIndex !== candidate.outputIndex
      || !candidate.canonical || candidate.confirmations < purchase.requiredConfirmations || receipt.blockHash !== candidate.blockHash || receipt.blockHeight !== candidate.blockHeight) {
      return review(tx, purchase, "CREDITED_PAYMENT_FINALITY_LOST");
    }
    return tx.creditPurchase.update({ where: { id: purchase.id }, data: evidence });
  }
  if (!candidate.canonical || candidate.confirmations < purchase.requiredConfirmations || candidate.blockHeight === null || candidate.blockHash === null || candidate.blockTime === null) {
    // An expired invoice remains reconcilable after a newer invoice occupies the open slot.
    const newerOpen = purchase.status === "EXPIRED" && await tx.creditPurchase.findFirst({ where: {
      creditAccountId: purchase.creditAccountId, id: { not: purchase.id }, status: { in: ["PENDING", "CONFIRMING"] }
    }, select: { id: true } });
    return tx.creditPurchase.update({ where: { id: purchase.id }, data: { ...evidence, status: newerOpen ? "EXPIRED" : "CONFIRMING" } });
  }
  if (candidate.blockHeight < purchase.startHeight || candidate.confirmations !== observation.tipHeight - candidate.blockHeight + 1) {
    return failure("CREDIT_PAYMENT_OBSERVER_UNAVAILABLE", 503, "Payment confirmation evidence is inconsistent");
  }
  const duplicate = await tx.creditPaymentReceipt.findUnique({ where: { network_txid_pool_outputIndex: {
    network: purchase.network, txid: candidate.txid, pool: candidate.pool, outputIndex: candidate.outputIndex
  } } });
  if (duplicate) return review(tx, purchase, "PAYMENT_ALREADY_USED");
  const account = await tx.creditAccount.findUniqueOrThrow({ where: { id: purchase.creditAccountId }, select: { id: true, paymentReview: true } });
  if (account.paymentReview || await tx.creditOperation.findFirst({ where: { accountId: account.id, kind: "PREVIEW_GRANT" }, select: { id: true } })) {
    return review(tx, purchase, "CREDIT_ACCOUNT_REQUIRES_REVIEW");
  }
  const credited = await tx.creditAccount.updateMany({ where: { id: account.id, paymentReview: false, balance: { lte: MAX_CREDIT_BALANCE - purchase.credits } }, data: { balance: { increment: purchase.credits } } });
  if (credited.count !== 1) return review(tx, purchase, "CREDIT_BALANCE_LIMIT");
  const community = await tx.community.findUniqueOrThrow({ where: { id: purchase.communityId }, select: { participationPolicyVersion: true } });
  await tx.creditPaymentReceipt.create({ data: {
    purchaseId: purchase.id, network: purchase.network, txid: candidate.txid, pool: candidate.pool, outputIndex: candidate.outputIndex,
    receiverAccountId: candidate.accountId, amountZat: BigInt(candidate.amountZat), memo: candidate.memo,
    blockHeight: candidate.blockHeight, blockHash: candidate.blockHash, blockTime: new Date(candidate.blockTime), confirmations: candidate.confirmations,
    tipHeight: observation.tipHeight, tipHash: observation.tipHash, scannedHeight: observation.scannedHeight
  } });
  await tx.creditOperation.create({ data: {
    accountId: account.id, communityId: purchase.communityId, userId: purchase.userId, kind: "PURCHASE", delta: purchase.credits,
    requestKey: `purchase:${purchase.id}`, purchaseId: purchase.id, targetId: purchase.id, policyVersion: community.participationPolicyVersion,
    payloadHash: createHash("sha256").update(JSON.stringify({ purchaseId: purchase.id, amountZat: purchase.amountZat.toString(), credits: purchase.credits,
      network: purchase.network, txid: candidate.txid, pool: candidate.pool, outputIndex: candidate.outputIndex })).digest("hex")
  } });
  return tx.creditPurchase.update({ where: { id: purchase.id }, data: { ...evidence, status: "CREDITED", creditedAt: new Date() } });
}

async function reconcilePurchase(purchaseId: string, userId?: string): Promise<CreditPurchaseView> {
  const leaseKey = randomUUID();
  const lease = await serializable(async tx => {
    if (userId) await activeUser(tx, userId);
    const purchase = await tx.creditPurchase.findFirst({ where: { id: purchaseId, ...(userId ? { userId } : {}) } });
    if (!purchase) return missing();
    if (purchase.status === "REVIEW") return { purchase, acquired: false };
    const now = new Date();
    const claimed = await tx.creditPurchase.updateMany({ where: {
      id: purchase.id, status: { not: "REVIEW" },
      AND: [ { OR: [{ checkLeaseUntil: null }, { checkLeaseUntil: { lte: now } }] },
        { OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lte: new Date(now.getTime() - CHECK_INTERVAL_MS) } }] } ]
    }, data: { checkLeaseKey: leaseKey, checkLeaseUntil: new Date(now.getTime() + LEASE_MS), lastCheckedAt: now } });
    return { purchase, acquired: claimed.count === 1 };
  });
  if (!lease.acquired) return view(lease.purchase);
  try {
    const receiver = usableReceiver(lease.purchase.communityId);
    if (!receiver) return failure("CREDIT_RECEIVER_UNAVAILABLE", 503, "The DAO receiving wallet is unavailable");
    if (!sameReceiver(lease.purchase, receiver)) {
      return view(await serializable(async tx => {
        const current = await tx.creditPurchase.findFirst({ where: { id: purchaseId, checkLeaseKey: leaseKey } });
        if (!current) return missing();
        return review(tx, current, "RECEIVER_IDENTITY_CHANGED");
      }));
    }
    let observation: CreditPaymentObservation;
    try { observation = await getCreditPaymentObserver().observe(receiver, { memo: lease.purchase.memo, startHeight: lease.purchase.startHeight, ...(lease.purchase.txid ? { knownTxid: lease.purchase.txid } : {}) }); }
    catch { return failure("CREDIT_PAYMENT_OBSERVER_UNAVAILABLE", 503, "Payment verification is temporarily unavailable. No credits were changed"); }
    const updated = await serializable(async tx => {
      const purchase = await tx.creditPurchase.findFirst({ where: { id: purchaseId, checkLeaseKey: leaseKey } });
      if (!purchase || purchase.status === "REVIEW") return tx.creditPurchase.findUniqueOrThrow({ where: { id: purchaseId } });
      return applyObservation(tx, purchase, observation);
    });
    return view(updated);
  } catch (error) {
    await db.creditPurchase.updateMany({ where: { id: purchaseId, checkLeaseKey: leaseKey }, data: { checkLeaseKey: null, checkLeaseUntil: null } });
    throw error;
  }
}

export async function checkCreditPurchase(userId: string, purchaseId: string): Promise<CreditPurchaseView> {
  if (!purchaseId.trim() || purchaseId.length > 128) return missing();
  return reconcilePurchase(purchaseId, userId);
}

/** Server-owned reconciliation, including credited receipts, with no caller-provided payment evidence. */
export async function reconcileCreditPurchases(limit = 20) {
  const ids = await db.creditPurchase.findMany({ where: { status: { in: ["PENDING", "CONFIRMING", "CREDITED", "EXPIRED"] } },
    orderBy: [{ lastCheckedAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }], take: Math.max(1, Math.min(100, limit)), select: { id: true } });
  const results: Array<{ id: string; status?: string; error?: string }> = [];
  for (const purchase of ids) {
    try { results.push({ id: purchase.id, status: (await reconcilePurchase(purchase.id)).status }); }
    catch (error) { results.push({ id: purchase.id, error: error instanceof CreditPurchaseError ? error.code : "CREDIT_RECONCILE_FAILED" }); }
  }
  return { processed: results.length, results };
}
