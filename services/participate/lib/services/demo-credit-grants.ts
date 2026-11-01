import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { isVerifiedPilotAccount, publicPilotScope } from "@/lib/auth/public-pilot-policy";
import { MAX_CREDIT_BALANCE } from "@/lib/domain/participation-credits";
import { ParticipationCreditError } from "./participation-credits";

export const operatorDemoGrantSchema = z.object({
  userId: z.string().trim().min(1).max(128),
  nick: z.string().trim().min(1).max(64),
  communityId: z.string().trim().min(1).max(128),
  amount: z.number().int().min(1).max(1000),
  requestKey: z.string().regex(/^demo-topup:[A-Za-z0-9][A-Za-z0-9:_-]{0,110}$/),
  reason: z.string().trim().min(8).max(128).regex(/^[^\u0000-\u001f\u007f]+$/)
}).strict();

/** Private operator entry point; intentionally has no public HTTP route. */
export async function grantOperatorDemoCredits(input: unknown, apply = false) {
  const parsed = operatorDemoGrantSchema.safeParse(input);
  if (!parsed.success) throw new ParticipationCreditError("Enter a valid demo top-up", 400, "INVALID_DEMO_GRANT");
  const value = parsed.data;
  const scope = publicPilotScope();
  if (!scope || scope.committeeId !== value.communityId) throw new ParticipationCreditError("This is not the public demo committee", 403, "DEMO_GRANT_SCOPE_REQUIRED");
  const payloadHash = createHash("sha256").update(JSON.stringify({ version: "operator-demo-grant:v1", ...value })).digest("hex");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(async tx => {
        const user = await tx.user.findFirst({ where: { id: value.userId, nick: value.nick, status: "ACTIVE" }, select: { id: true, email: true, emailVerifiedAt: true } });
        if (!user || !isVerifiedPilotAccount(user)) throw new ParticipationCreditError("Verified account does not match", 403, "DEMO_GRANT_IDENTITY_MISMATCH");
        const community = await tx.community.findFirst({ where: { id: value.communityId, kind: "COMMITTEE", committeeArchives: { some: { communityId: scope.hostId, revisions: { some: {} } } } }, select: { participationPolicyVersion: true } });
        if (!community) throw new ParticipationCreditError("Demo committee not found", 404, "DEMO_GRANT_SCOPE_REQUIRED");
        const account = await tx.creditAccount.findUnique({ where: { communityId_userId: { communityId: value.communityId, userId: value.userId } }, select: {
          id: true, balance: true, paymentReview: true,
          purchases: { take: 1, select: { id: true } },
          operations: { where: { kind: "PREVIEW_GRANT" }, take: 1, select: { id: true } }
        } });
        if (!account || account.paymentReview || account.purchases.length || !account.operations.length) throw new ParticipationCreditError("Only an existing unpaid demo account may receive a top-up", 403, "DEMO_GRANT_ACCOUNT_REQUIRED");
        const existing = await tx.creditOperation.findUnique({ where: { accountId_requestKey: { accountId: account.id, requestKey: value.requestKey } } });
        if (existing && (existing.kind !== "ADMIN_DEMO_GRANT" || existing.payloadHash !== payloadHash || existing.delta !== value.amount || existing.targetId !== value.reason)) throw new ParticipationCreditError("Request key already used for another action", 409, "CREDIT_IDEMPOTENCY_CONFLICT");
        if (existing) return { applied: false, replayed: true, balance: account.balance, operationId: existing.id };
        if (account.balance > MAX_CREDIT_BALANCE - value.amount) throw new ParticipationCreditError("Credit balance limit reached", 409, "CREDIT_BALANCE_LIMIT");
        if (!apply) return { applied: false, replayed: false, balance: account.balance, proposedBalance: account.balance + value.amount, operationId: null };
        const increment = await tx.creditAccount.updateMany({ where: { id: account.id, paymentReview: false, balance: { lte: MAX_CREDIT_BALANCE - value.amount } }, data: { balance: { increment: value.amount } } });
        if (increment.count !== 1) throw new ParticipationCreditError("Account changed; check it again", 409, "CREDIT_BALANCE_LIMIT");
        const operation = await tx.creditOperation.create({ data: {
          accountId: account.id, communityId: value.communityId, userId: value.userId,
          kind: "ADMIN_DEMO_GRANT", delta: value.amount, requestKey: value.requestKey,
          payloadHash, targetId: value.reason, policyVersion: community.participationPolicyVersion
        }, select: { id: true } });
        return { applied: true, replayed: false, balance: account.balance + value.amount, operationId: operation.id };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code) && attempt < 2) continue;
      throw error;
    }
  }
  throw new Error("Unreachable retry");
}
