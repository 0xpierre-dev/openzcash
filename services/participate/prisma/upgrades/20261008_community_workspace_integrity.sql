-- Idempotent integrity installation for a fresh schema created by Prisma.
-- Same CHECK/function/trigger bodies as 20261008_community_workspace.sql.
-- Adds no columns, types, keys, rows, privileges, or balances.
-- Existing records must satisfy the reviewed accounting and discussion constraints.
BEGIN;

-- Prisma does not describe these integrity checks/triggers. Keep them when upgrading.
DO $install$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CommunityTreasury_recorded_amounts_check' AND conrelid = '"CommunityTreasury"'::regclass) THEN
        ALTER TABLE "CommunityTreasury" ADD CONSTRAINT "CommunityTreasury_recorded_amounts_check" CHECK (
    "currency" = 'ZEC' AND
    "availableZat" BETWEEN 0 AND 2100000000000000 AND
    "reservedZat" BETWEEN 0 AND 2100000000000000 AND
    "committedZat" BETWEEN 0 AND 2100000000000000 AND
    "paidZat" BETWEEN 0 AND 2100000000000000
);
    END IF;
END $install$;

DO $install$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TreasuryOperation_shape_check' AND conrelid = '"TreasuryOperation"'::regclass) THEN
        ALTER TABLE "TreasuryOperation" ADD CONSTRAINT "TreasuryOperation_shape_check" CHECK (
    "currency" = 'ZEC' AND "amountZat" BETWEEN 1 AND 2100000000000000 AND
    length(btrim("reason")) BETWEEN 3 AND 500 AND length(btrim("actorLabel")) > 0 AND
    "idempotencyKey" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND
    "payloadHash" ~ '^[0-9a-f]{64}$' AND (
      ("kind" = 'FUNDING' AND "sourceTreasuryId" IS NULL AND "fundingSource" IS NOT NULL AND length(btrim("fundingSource")) BETWEEN 3 AND 200) OR
      ("kind" = 'ALLOCATION' AND "sourceTreasuryId" IS NOT NULL AND "sourceTreasuryId" <> "destinationTreasuryId" AND "fundingSource" IS NULL)
    )
);
    END IF;
END $install$;

DO $install$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TreasuryLedgerEntry_delta_check' AND conrelid = '"TreasuryLedgerEntry"'::regclass) THEN
        ALTER TABLE "TreasuryLedgerEntry" ADD CONSTRAINT "TreasuryLedgerEntry_delta_check" CHECK (
    "deltaZat" <> 0 AND "deltaZat" BETWEEN -2100000000000000 AND 2100000000000000
);
    END IF;
END $install$;

DO $install$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Poll_funding_request_check' AND conrelid = '"Poll"'::regclass) THEN
        ALTER TABLE "Poll" ADD CONSTRAINT "Poll_funding_request_check" CHECK (
    ("treasuryId" IS NULL AND "requestedAmountZat" IS NULL) OR
    ("treasuryId" IS NOT NULL AND "communityId" IS NOT NULL AND "requestedAmountZat" IS NOT NULL AND "requestedAmountZat" BETWEEN 1 AND 2100000000000000)
);
    END IF;
END $install$;
DO $install$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Poll_content_hash_version_check' AND conrelid = '"Poll"'::regclass) THEN
        ALTER TABLE "Poll" ADD CONSTRAINT "Poll_content_hash_version_check" CHECK (
    "contentHashVersion" IS NULL OR "contentHashVersion" = 'PROPOSAL_CONTENT_V1'
);
    END IF;
END $install$;

DO $install$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PollComment_author_check' AND conrelid = '"PollComment"'::regclass) THEN
        ALTER TABLE "PollComment" ADD CONSTRAINT "PollComment_author_check" CHECK (
    ("authorUserId" IS NOT NULL) <> ("authorPollVoterAccessId" IS NOT NULL)
);
    END IF;
END $install$;
DO $install$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PollComment_moderation_check' AND conrelid = '"PollComment"'::regclass) THEN
        ALTER TABLE "PollComment" ADD CONSTRAINT "PollComment_moderation_check" CHECK (
    ("hiddenAt" IS NULL AND "hiddenByUserId" IS NULL AND "hiddenByLabel" IS NULL AND "hideReason" IS NULL) OR
    ("hiddenAt" IS NOT NULL AND "hiddenByUserId" IS NOT NULL AND "hiddenByLabel" IS NOT NULL AND length(btrim("hiddenByLabel")) > 0 AND "hideReason" IS NOT NULL AND length(btrim("hideReason")) BETWEEN 1 AND 500)
);
    END IF;
END $install$;

-- Accounting history is append-only. Corrections must be new supported operations.
CREATE OR REPLACE FUNCTION community_workspace_journal_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Recorded treasury history cannot be changed or deleted';
END;
$$;
DO $install$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'TreasuryOperation_immutable' AND tgrelid = '"TreasuryOperation"'::regclass) THEN
        CREATE TRIGGER "TreasuryOperation_immutable" BEFORE UPDATE OR DELETE ON "TreasuryOperation"
    FOR EACH ROW EXECUTE FUNCTION community_workspace_journal_immutable();
    END IF;
END $install$;
DO $install$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'TreasuryLedgerEntry_immutable' AND tgrelid = '"TreasuryLedgerEntry"'::regclass) THEN
        CREATE TRIGGER "TreasuryLedgerEntry_immutable" BEFORE UPDATE OR DELETE ON "TreasuryLedgerEntry"
    FOR EACH ROW EXECUTE FUNCTION community_workspace_journal_immutable();
    END IF;
END $install$;

-- Check the completed journal at commit, after both sides have been inserted.
CREATE OR REPLACE FUNCTION community_workspace_journal_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    operation_id text;
    operation_row "TreasuryOperation"%ROWTYPE;
    entry_count bigint;
    delta_total numeric;
    credits bigint;
    debits bigint;
BEGIN
    IF TG_TABLE_NAME = 'TreasuryOperation' THEN
        operation_id := NEW."id";
    ELSE
        operation_id := NEW."operationId";
    END IF;
    SELECT * INTO STRICT operation_row FROM "TreasuryOperation" WHERE "id" = operation_id;
    SELECT count(*), COALESCE(sum("deltaZat"), 0),
        count(*) FILTER (WHERE "treasuryId" = operation_row."destinationTreasuryId" AND "deltaZat" = operation_row."amountZat"),
        count(*) FILTER (WHERE "treasuryId" = operation_row."sourceTreasuryId" AND "deltaZat" = -operation_row."amountZat")
    INTO entry_count, delta_total, credits, debits
    FROM "TreasuryLedgerEntry" WHERE "operationId" = operation_id;
    IF operation_row."kind" = 'FUNDING' THEN
        IF entry_count <> 1 OR credits <> 1 OR delta_total <> operation_row."amountZat" THEN
            RAISE EXCEPTION 'Funding journal is incomplete';
        END IF;
    ELSE
        IF entry_count <> 2 OR credits <> 1 OR debits <> 1 OR delta_total <> 0 THEN
            RAISE EXCEPTION 'Allocation journal must contain matching debit and credit';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
DO $install$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'TreasuryOperation_journal_complete' AND tgrelid = '"TreasuryOperation"'::regclass) THEN
        CREATE CONSTRAINT TRIGGER "TreasuryOperation_journal_complete" AFTER INSERT ON "TreasuryOperation"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION community_workspace_journal_complete();
    END IF;
END $install$;
DO $install$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'TreasuryLedgerEntry_journal_complete' AND tgrelid = '"TreasuryLedgerEntry"'::regclass) THEN
        CREATE CONSTRAINT TRIGGER "TreasuryLedgerEntry_journal_complete" AFTER INSERT ON "TreasuryLedgerEntry"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION community_workspace_journal_complete();
    END IF;
END $install$;

COMMIT;
