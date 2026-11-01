-- Additive: preserves all legacy rounds, tickets and receipts. No backfill.
BEGIN;
CREATE TABLE IF NOT EXISTS "PollCollectionCheck" (
  "id" TEXT PRIMARY KEY,
  "pollId" TEXT NOT NULL REFERENCES "Poll"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "actorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "requestKey" TEXT NOT NULL,
  "scopeHash" TEXT NOT NULL CHECK ("scopeHash" ~ '^[a-f0-9]{64}$'),
  "status" TEXT NOT NULL DEFAULT 'RUNNING' CHECK ("status" IN ('RUNNING', 'OBSERVED', 'BLOCKED')),
  "reason" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  "leaseExpiresAt" TIMESTAMP(3) NOT NULL,
  "finishedAt" TIMESTAMP(3),
  "sourceVersion" TEXT,
  "sourceFingerprint" TEXT,
  "network" TEXT CHECK ("network" IN ('mainnet', 'testnet', 'regtest')),
  "tipHeight" INTEGER,
  "scannedHeight" INTEGER,
  "transactionCount" INTEGER,
  "outputCount" INTEGER,
  "evidenceHash" TEXT,
  "evidence" JSONB,
  CONSTRAINT "PollCollectionCheck_time" CHECK ("leaseExpiresAt" > "startedAt" AND ("finishedAt" IS NULL OR "finishedAt" >= "startedAt")),
  CONSTRAINT "PollCollectionCheck_state" CHECK (
    ("status" = 'RUNNING' AND "finishedAt" IS NULL AND "reason" IS NULL AND "evidence" IS NULL) OR
    ("status" = 'BLOCKED' AND "finishedAt" IS NOT NULL AND "reason" IS NOT NULL AND "evidence" IS NULL) OR
    ("status" = 'OBSERVED' AND "finishedAt" IS NOT NULL AND "reason" IS NULL AND "network" IS NOT NULL
      AND "sourceVersion" IS NOT NULL AND "sourceFingerprint" IS NOT NULL AND "sourceFingerprint" ~ '^[a-f0-9]{64}$'
      AND "tipHeight" IS NOT NULL AND "scannedHeight" IS NOT NULL AND "transactionCount" IS NOT NULL AND "outputCount" IS NOT NULL
      AND "tipHeight" > 0 AND "scannedHeight" = "tipHeight" AND "transactionCount" >= 0 AND "outputCount" >= 0
      AND "evidenceHash" IS NOT NULL AND "evidenceHash" ~ '^[a-f0-9]{64}$' AND "evidence" IS NOT NULL
      AND ("evidence"->>'kind') IS NOT DISTINCT FROM 'WALLET_HISTORY_ONLY')
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS "PollCollectionCheck_pollId_actorId_requestKey_key" ON "PollCollectionCheck"("pollId", "actorId", "requestKey");
CREATE INDEX IF NOT EXISTS "PollCollectionCheck_pollId_startedAt_idx" ON "PollCollectionCheck"("pollId", "startedAt");

CREATE OR REPLACE FUNCTION protect_poll_collection_check() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Collection history cannot be deleted'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'RUNNING' THEN RAISE EXCEPTION 'Collection checks must start as RUNNING'; END IF;
    RETURN NEW;
  END IF;
  IF OLD."status" <> 'RUNNING' OR NEW."status" = 'RUNNING' THEN
    RAISE EXCEPTION 'Completed collection checks are immutable';
  END IF;
  IF (NEW."id", NEW."pollId", NEW."actorId", NEW."requestKey", NEW."scopeHash", NEW."startedAt", NEW."leaseExpiresAt")
    IS DISTINCT FROM (OLD."id", OLD."pollId", OLD."actorId", OLD."requestKey", OLD."scopeHash", OLD."startedAt", OLD."leaseExpiresAt") THEN
    RAISE EXCEPTION 'Collection request identity is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "protect_poll_collection_check" ON "PollCollectionCheck";
CREATE TRIGGER "protect_poll_collection_check" BEFORE INSERT OR UPDATE OR DELETE ON "PollCollectionCheck"
  FOR EACH ROW EXECUTE FUNCTION protect_poll_collection_check();
COMMIT;
