-- Additive, rerunnable; apply after the USD budget upgrade. No balance changes.
BEGIN;

CREATE TABLE IF NOT EXISTS "ProposalFundingQuote" (
  "id" TEXT PRIMARY KEY,
  "pollId" TEXT NOT NULL REFERENCES "Poll"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "actorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "requestKey" TEXT NOT NULL,
  "proposalHash" TEXT NOT NULL,
  "usdCents" BIGINT NOT NULL,
  "rateUsdPerZecE8" BIGINT NOT NULL,
  "amountZat" BIGINT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'COINGECKO',
  "quotedAt" TIMESTAMP(3) NOT NULL,
  "retrievedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  "rounding" TEXT NOT NULL DEFAULT 'CEILING_ZAT',
  "fees" TEXT NOT NULL DEFAULT 'EXCLUDED'
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProposalFundingQuote_pollId_actorId_requestKey_key" ON "ProposalFundingQuote"("pollId", "actorId", "requestKey");
CREATE INDEX IF NOT EXISTS "ProposalFundingQuote_pollId_createdAt_idx" ON "ProposalFundingQuote"("pollId", "createdAt");
ALTER TABLE "ProposalFundingQuote" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

ALTER TABLE "ProposalFundingQuote" DROP CONSTRAINT IF EXISTS "ProposalFundingQuote_values_check";
ALTER TABLE "ProposalFundingQuote" ADD CONSTRAINT "ProposalFundingQuote_values_check" CHECK (
  "usdCents" > 0 AND "rateUsdPerZecE8" BETWEEN 1 AND 1000000000000000
  AND "amountZat" BETWEEN 1 AND 2100000000000000
  AND "amountZat" = CEIL("usdCents"::numeric * 100000000000000 / NULLIF("rateUsdPerZecE8", 0))
  AND "source" = 'COINGECKO' AND "rounding" = 'CEILING_ZAT' AND "fees" = 'EXCLUDED'
  AND "proposalHash" ~ '^[a-f0-9]{64}$'
  AND "requestKey" ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  AND "quotedAt" <= "retrievedAt" AND "retrievedAt" < "expiresAt"
  AND "expiresAt" = LEAST("quotedAt" + INTERVAL '5 minutes', date_trunc('day', "quotedAt") + INTERVAL '1 day')
);

CREATE OR REPLACE FUNCTION immutable_funding_quote() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Funding estimate history is immutable';
END;
$$;
DROP TRIGGER IF EXISTS "ProposalFundingQuote_immutable" ON "ProposalFundingQuote";
CREATE TRIGGER "ProposalFundingQuote_immutable" BEFORE UPDATE OR DELETE ON "ProposalFundingQuote"
  FOR EACH ROW EXECUTE FUNCTION immutable_funding_quote();

CREATE TABLE IF NOT EXISTS "FundingQuoteThrottle" (
  "userId" TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "attempts" INTEGER NOT NULL CHECK ("attempts" BETWEEN 1 AND 6),
  "resetsAt" TIMESTAMP(3) NOT NULL
);
COMMIT;
