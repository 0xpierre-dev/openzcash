import { Prisma, type ProposalFundingQuote } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertFreshFundingQuote, estimateFundingZat, fundingQuoteExpiresAt, type FundingQuoteHistory, type FundingQuoteView } from "@/lib/domain/funding-quote";
import { getZecUsdPrice, ZecPriceError } from "@/lib/market/zec-usd";

export class FundingQuoteError extends Error {
  constructor(message: string, public readonly status: 400 | 404 | 409 | 429 | 503, public readonly code: string) {
    super(message); this.name = "FundingQuoteError";
  }
}

const inputSchema = z.object({
  requestKey: z.string().uuid().transform((value) => value.toLowerCase()),
  proposalHash: z.string().regex(/^[a-f0-9]{64}$/)
}).strict();

async function managedProposal(tx: Prisma.TransactionClient, communityId: string, pollId: string, userId: string) {
  const poll = await tx.poll.findFirst({
    where: { id: pollId, communityId, community: { memberships: { some: {
      userId, status: "ACTIVE", role: { in: ["OWNER", "MANAGER"] }, user: { status: "ACTIVE" }
    } } } },
    select: { id: true, questionHash: true, status: true, requestedAmountUsdCents: true, treasuryId: true }
  });
  if (!poll) throw new FundingQuoteError("Proposal not found", 404, "PROPOSAL_NOT_FOUND");
  if (!poll.treasuryId || !poll.requestedAmountUsdCents) {
    throw new FundingQuoteError("This proposal has no USD funding request", 409, "USD_FUNDING_REQUIRED");
  }
  return { ...poll, usdCents: poll.requestedAmountUsdCents };
}

function quoteView(row: ProposalFundingQuote): FundingQuoteView {
  return {
    id: row.id, kind: "ESTIMATE", proposalHash: row.proposalHash, usdCents: row.usdCents.toString(),
    rateUsdPerZecE8: row.rateUsdPerZecE8.toString(), amountZat: row.amountZat.toString(), source: "COINGECKO",
    quotedAt: row.quotedAt.toISOString(), retrievedAt: row.retrievedAt.toISOString(), expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(), rounding: "CEILING_ZAT", fees: "EXCLUDED"
  };
}

export async function readFundingQuotes(communityId: string, pollId: string, userId: string): Promise<FundingQuoteHistory> {
  return db.$transaction(async (tx) => {
    const poll = await managedProposal(tx, communityId, pollId, userId);
    const rows = await tx.proposalFundingQuote.findMany({ where: { pollId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 5 });
    return { proposalHash: poll.questionHash, usdCents: poll.usdCents.toString(), canEstimate: poll.status !== "ARCHIVED", quotes: rows.map(quoteView) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

async function claimPriceRequest(userId: string) {
  // Atomic across instances, including failed provider requests. One bounded row per account.
  const rows = await db.$queryRaw<Array<{ attempts: number }>>`
    INSERT INTO "FundingQuoteThrottle" ("userId", "attempts", "resetsAt")
    VALUES (${userId}, 1, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 minute')
    ON CONFLICT ("userId") DO UPDATE SET
      "attempts" = CASE WHEN "FundingQuoteThrottle"."resetsAt" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') THEN 1
        ELSE LEAST("FundingQuoteThrottle"."attempts" + 1, 6) END,
      "resetsAt" = CASE WHEN "FundingQuoteThrottle"."resetsAt" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') THEN (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 minute'
        ELSE "FundingQuoteThrottle"."resetsAt" END
    RETURNING "attempts"`;
  if (!rows[0] || rows[0].attempts > 5) throw new FundingQuoteError("Wait a minute before requesting another estimate", 429, "QUOTE_RATE_LIMITED");
}

export async function createFundingQuote(communityId: string, pollId: string, userId: string, input: unknown) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new FundingQuoteError("Refresh the proposal and try again", 400, "INVALID_QUOTE_INPUT");
  const { proposalHash, requestKey } = parsed.data;
  const poll = await managedProposal(db, communityId, pollId, userId);
  if (poll.questionHash !== proposalHash) throw new FundingQuoteError("The proposal changed. Reload before estimating.", 409, "PROPOSAL_CHANGED");
  const key = { pollId_actorId_requestKey: { pollId, actorId: userId, requestKey } };
  const existing = await db.proposalFundingQuote.findUnique({ where: key });
  if (existing) {
    if (existing.proposalHash !== proposalHash) throw new FundingQuoteError("Use a new request for this proposal version", 409, "QUOTE_REQUEST_CONFLICT");
    return { quote: quoteView(existing), replayed: true };
  }
  if (poll.status === "ARCHIVED") throw new FundingQuoteError("Archived proposals are read only", 409, "PROPOSAL_ARCHIVED");
  await claimPriceRequest(userId);
  const price = await getZecUsdPrice().catch((error) => {
    if (error instanceof ZecPriceError) throw new FundingQuoteError(error.message, 503, "PRICE_UNAVAILABLE");
    throw error;
  });
  let amountZat: bigint;
  try { amountZat = estimateFundingZat(poll.usdCents, price.rateUsdPerZecE8); } catch {
    throw new FundingQuoteError("The estimate exceeds the supported ZEC limit", 409, "QUOTE_AMOUNT_LIMIT");
  }
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await db.$transaction(async (tx) => {
        // Hold the proposal against edits while checking authorization and saving its snapshot.
        await tx.$queryRaw`SELECT "id" FROM "Poll" WHERE "id" = ${pollId} FOR SHARE`;
        const current = await managedProposal(tx, communityId, pollId, userId);
        if (current.questionHash !== proposalHash || current.usdCents !== poll.usdCents || current.treasuryId !== poll.treasuryId) {
          throw new FundingQuoteError("The proposal changed. Reload before estimating.", 409, "PROPOSAL_CHANGED");
        }
        const replay = await tx.proposalFundingQuote.findUnique({ where: key });
        if (replay) {
          if (replay.proposalHash !== proposalHash) throw new FundingQuoteError("Use a new request for this proposal version", 409, "QUOTE_REQUEST_CONFLICT");
          return { quote: quoteView(replay), replayed: true };
        }
        if (current.status === "ARCHIVED") throw new FundingQuoteError("Archived proposals are read only", 409, "PROPOSAL_ARCHIVED");
        try { assertFreshFundingQuote(price.quotedAt, new Date()); } catch {
          throw new FundingQuoteError("The price expired. Request a new estimate.", 503, "PRICE_UNAVAILABLE");
        }
        const quote = await tx.proposalFundingQuote.create({ data: {
          pollId, actorId: userId, requestKey, proposalHash, usdCents: current.usdCents,
          amountZat, ...price, expiresAt: fundingQuoteExpiresAt(price.quotedAt)
        } });
        return { quote: quoteView(quote), replayed: false };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code);
      if (!retryable) throw error;
      if (attempt === 3) throw new FundingQuoteError("The proposal changed. Retry the same request.", 409, "QUOTE_RETRY_REQUIRED");
    }
  }
  throw new FundingQuoteError("Try the estimate again", 409, "QUOTE_RETRY_REQUIRED");
}
