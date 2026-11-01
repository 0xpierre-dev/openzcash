import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  MAX_TREASURY_AMOUNT_ZAT,
  TREASURY_KINDS,
  parseTreasuryAmountZat,
  treasuryAllocationInputSchema,
  treasuryFundingInputSchema,
  type CommunityTreasuryView,
  type TreasuryKindValue,
  type TreasuryMutationResult
} from "@/lib/domain/treasury";

export class TreasuryServiceError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 403 | 404 | 409,
    public readonly code: string
  ) {
    super(message);
    this.name = "TreasuryServiceError";
  }
}

type TreasuryClient = Prisma.TransactionClient;

async function requireTreasuryMembership(
  tx: TreasuryClient,
  communityId: string,
  userId: string,
  ownerRequired = false
) {
  if (!communityId?.trim() || !userId?.trim()) {
    throw new TreasuryServiceError("Community not found", 404, "COMMUNITY_NOT_FOUND");
  }
  const membership = await tx.communityMembership.findFirst({
    where: {
      communityId,
      community: { kind: "DAO" },
      userId,
      status: "ACTIVE",
      role: { in: ["OWNER", "MANAGER"] },
      user: { status: "ACTIVE" }
    },
    select: { role: true, user: { select: { nick: true } } }
  });
  if (!membership) {
    throw new TreasuryServiceError("Community not found", 404, "COMMUNITY_NOT_FOUND");
  }
  if (ownerRequired && membership.role !== "OWNER") {
    throw new TreasuryServiceError("Only a community owner can record treasury changes", 403, "TREASURY_OWNER_REQUIRED");
  }
  return membership;
}

async function readTreasuryView(
  tx: TreasuryClient,
  communityId: string,
  canManage: boolean
): Promise<CommunityTreasuryView> {
  const funds = await tx.communityTreasury.findMany({
    where: { communityId },
    select: {
      id: true, kind: true, availableZat: true, reservedZat: true, committedZat: true, paidZat: true,
      _count: { select: { entries: true } }
    }
  });
  const activity = await tx.treasuryOperation.findMany({
    where: { communityId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 20,
    select: {
      id: true, kind: true, amountZat: true, fundingSource: true, reason: true,
      actorLabel: true, createdAt: true,
      sourceTreasury: { select: { kind: true } },
      destinationTreasury: { select: { kind: true } }
    }
  });
  return {
    communityId,
    currency: "ZEC",
    canManage,
    funds: TREASURY_KINDS.map((kind) => {
      const fund = funds.find((entry) => entry.kind === kind);
      return {
        id: fund?.id ?? null,
        kind,
        name: kind === "COMMUNITY" ? "Community Treasury" : "Sustainability Treasury",
        currency: "ZEC",
        availableZat: fund?.availableZat.toString() ?? "0",
        reservedZat: fund?.reservedZat.toString() ?? "0",
        committedZat: fund?.committedZat.toString() ?? "0",
        paidZat: fund?.paidZat.toString() ?? "0",
        hasEntries: (fund?._count.entries ?? 0) > 0
      };
    }),
    recentActivity: activity.map((operation) => ({
      id: operation.id,
      kind: operation.kind,
      amountZat: operation.amountZat.toString(),
      fromTreasuryKind: operation.sourceTreasury?.kind ?? null,
      toTreasuryKind: operation.destinationTreasury.kind,
      fundingSource: operation.fundingSource,
      reason: operation.reason,
      actorLabel: operation.actorLabel,
      createdAt: operation.createdAt.toISOString()
    }))
  };
}

export async function readCommunityTreasuries(communityId: string, userId: string): Promise<CommunityTreasuryView> {
  return db.$transaction(async (tx) => {
    const membership = await requireTreasuryMembership(tx, communityId, userId);
    return readTreasuryView(tx, communityId, membership.role === "OWNER");
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

async function ensureTreasuries(tx: TreasuryClient, communityId: string) {
  const funds = new Map<TreasuryKindValue, { id: string }>();
  for (const kind of TREASURY_KINDS) {
    const fund = await tx.communityTreasury.upsert({
      where: { communityId_kind: { communityId, kind } },
      create: { communityId, kind },
      update: {},
      select: { id: true }
    });
    funds.set(kind, fund);
  }
  return funds;
}

function payloadHash(payload: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function isRetryableTransactionError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error &&
    ["P2034", "P2002"].includes(String(error.code));
}

async function withSerializableRetry<T>(callback: (tx: TreasuryClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await db.$transaction(callback, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 10000
      });
    } catch (error) {
      if (!isRetryableTransactionError(error)) throw error;
      if (attempt === 3) {
        throw new TreasuryServiceError("The treasury changed. Retry the same request", 409, "RETRY_REQUIRED");
      }
    }
  }
  throw new TreasuryServiceError("Retry the same request", 409, "RETRY_REQUIRED");
}

async function isReplay(tx: TreasuryClient, communityId: string, idempotencyKey: string, hash: string) {
  const operation = await tx.treasuryOperation.findUnique({
    where: { communityId_idempotencyKey: { communityId, idempotencyKey } },
    select: { payloadHash: true }
  });
  if (!operation) return false;
  if (operation.payloadHash !== hash) {
    throw new TreasuryServiceError("This request key was already used for a different change", 409, "IDEMPOTENCY_CONFLICT");
  }
  return true;
}

async function creditAvailable(tx: TreasuryClient, communityId: string, treasuryId: string, amountZat: bigint) {
  const result = await tx.communityTreasury.updateMany({
    where: { id: treasuryId, communityId, availableZat: { lte: MAX_TREASURY_AMOUNT_ZAT - amountZat } },
    data: { availableZat: { increment: amountZat } }
  });
  if (result.count !== 1) {
    throw new TreasuryServiceError("The recorded fund balance would exceed the supported ZEC limit", 409, "TREASURY_BALANCE_LIMIT");
  }
}

export async function recordTreasuryFunding(
  communityId: string,
  userId: string,
  input: unknown
): Promise<TreasuryMutationResult> {
  const parsed = treasuryFundingInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new TreasuryServiceError("Enter a fund, positive ZEC amount, funding source, reason and request key", 400, "INVALID_TREASURY_INPUT");
  }
  const data = parsed.data;
  const amountZat = parseTreasuryAmountZat(data.amountZec);
  const hash = payloadHash({
    kind: "FUNDING", communityId, userId, treasuryKind: data.treasuryKind,
    amountZat: amountZat.toString(), fundingSource: data.fundingSource, reason: data.reason
  });
  return withSerializableRetry(async (tx) => {
    const membership = await requireTreasuryMembership(tx, communityId, userId, true);
    if (await isReplay(tx, communityId, data.idempotencyKey, hash)) {
      return { treasuries: await readTreasuryView(tx, communityId, true), replayed: true };
    }
    const funds = await ensureTreasuries(tx, communityId);
    const destination = funds.get(data.treasuryKind)!;
    const operation = await tx.treasuryOperation.create({
      data: {
        communityId, kind: "FUNDING", destinationTreasuryId: destination.id,
        amountZat, fundingSource: data.fundingSource, reason: data.reason,
        actorUserId: userId, actorLabel: membership.user.nick,
        idempotencyKey: data.idempotencyKey, payloadHash: hash
      },
      select: { id: true }
    });
    await creditAvailable(tx, communityId, destination.id, amountZat);
    await tx.treasuryLedgerEntry.create({
      data: { communityId, treasuryId: destination.id, operationId: operation.id, deltaZat: amountZat }
    });
    return { treasuries: await readTreasuryView(tx, communityId, true), replayed: false };
  });
}

export async function allocateTreasuryFunds(
  communityId: string,
  userId: string,
  input: unknown
): Promise<TreasuryMutationResult> {
  const parsed = treasuryAllocationInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new TreasuryServiceError("Choose different funds, a positive ZEC amount, reason and request key", 400, "INVALID_TREASURY_INPUT");
  }
  const data = parsed.data;
  const amountZat = parseTreasuryAmountZat(data.amountZec);
  const hash = payloadHash({
    kind: "ALLOCATION", communityId, userId, fromTreasuryKind: data.fromTreasuryKind,
    toTreasuryKind: data.toTreasuryKind, amountZat: amountZat.toString(), reason: data.reason
  });
  return withSerializableRetry(async (tx) => {
    const membership = await requireTreasuryMembership(tx, communityId, userId, true);
    if (await isReplay(tx, communityId, data.idempotencyKey, hash)) {
      return { treasuries: await readTreasuryView(tx, communityId, true), replayed: true };
    }
    const funds = await ensureTreasuries(tx, communityId);
    const source = funds.get(data.fromTreasuryKind)!;
    const destination = funds.get(data.toTreasuryKind)!;
    const operation = await tx.treasuryOperation.create({
      data: {
        communityId, kind: "ALLOCATION", sourceTreasuryId: source.id,
        destinationTreasuryId: destination.id, amountZat, reason: data.reason,
        actorUserId: userId, actorLabel: membership.user.nick,
        idempotencyKey: data.idempotencyKey, payloadHash: hash
      },
      select: { id: true }
    });
    const debit = await tx.communityTreasury.updateMany({
      where: { id: source.id, communityId, availableZat: { gte: amountZat } },
      data: { availableZat: { decrement: amountZat } }
    });
    if (debit.count !== 1) {
      throw new TreasuryServiceError("The source fund has insufficient available recorded funds", 409, "INSUFFICIENT_RECORDED_FUNDS");
    }
    await creditAvailable(tx, communityId, destination.id, amountZat);
    await tx.treasuryLedgerEntry.createMany({
      data: [
        { communityId, treasuryId: source.id, operationId: operation.id, deltaZat: -amountZat },
        { communityId, treasuryId: destination.id, operationId: operation.id, deltaZat: amountZat }
      ]
    });
    return { treasuries: await readTreasuryView(tx, communityId, true), replayed: false };
  });
}
