-- Additive upgrade from the community-isolation schema (5fc35fb).
-- Review and back up before applying to an existing database. Apply once, after
-- 20261008_community_isolation.sql; never use a reset or db push against legacy data.
-- No legacy record is assigned, deleted, rehashed, or granted broader access.
-- New proposal fields and contentHashVersion remain NULL for preserved legacy polls.
-- Recorded ZEC accounting only: no chain transfer, custody or balance reconciliation.
-- Reservations, commitments and payments require later authorized workflows.
BEGIN;

-- CreateEnum
CREATE TYPE "TreasuryKind" AS ENUM ('COMMUNITY', 'SUSTAINABILITY');

-- CreateEnum
CREATE TYPE "TreasuryOperationKind" AS ENUM ('FUNDING', 'ALLOCATION');

-- AlterTable
ALTER TABLE "Poll" ADD COLUMN     "contentHashVersion" TEXT,
ADD COLUMN     "proposalBody" TEXT,
ADD COLUMN     "requestedAmountZat" BIGINT,
ADD COLUMN     "treasuryId" TEXT;

-- CreateTable
CREATE TABLE "CommunityTreasury" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "kind" "TreasuryKind" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZEC',
    "availableZat" BIGINT NOT NULL DEFAULT 0,
    "reservedZat" BIGINT NOT NULL DEFAULT 0,
    "committedZat" BIGINT NOT NULL DEFAULT 0,
    "paidZat" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityTreasury_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreasuryOperation" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "kind" "TreasuryOperationKind" NOT NULL,
    "sourceTreasuryId" TEXT,
    "destinationTreasuryId" TEXT NOT NULL,
    "amountZat" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZEC',
    "fundingSource" TEXT,
    "reason" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorLabel" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreasuryOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreasuryLedgerEntry" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "treasuryId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "deltaZat" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreasuryLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollComment" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "parentId" TEXT,
    "authorUserId" TEXT,
    "authorPollVoterAccessId" TEXT,
    "authorLabel" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hiddenAt" TIMESTAMP(3),
    "hiddenByUserId" TEXT,
    "hiddenByLabel" TEXT,
    "hideReason" TEXT,

    CONSTRAINT "PollComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommunityTreasury_communityId_kind_key" ON "CommunityTreasury"("communityId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityTreasury_id_communityId_key" ON "CommunityTreasury"("id", "communityId");

-- CreateIndex
CREATE INDEX "TreasuryOperation_communityId_createdAt_idx" ON "TreasuryOperation"("communityId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TreasuryOperation_communityId_idempotencyKey_key" ON "TreasuryOperation"("communityId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "TreasuryOperation_id_communityId_key" ON "TreasuryOperation"("id", "communityId");

-- CreateIndex
CREATE INDEX "TreasuryLedgerEntry_treasuryId_createdAt_idx" ON "TreasuryLedgerEntry"("treasuryId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TreasuryLedgerEntry_operationId_treasuryId_key" ON "TreasuryLedgerEntry"("operationId", "treasuryId");

-- CreateIndex
CREATE INDEX "PollComment_pollId_createdAt_idx" ON "PollComment"("pollId", "createdAt");

-- CreateIndex
CREATE INDEX "PollComment_authorUserId_createdAt_idx" ON "PollComment"("authorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "PollComment_authorPollVoterAccessId_createdAt_idx" ON "PollComment"("authorPollVoterAccessId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PollComment_id_pollId_key" ON "PollComment"("id", "pollId");

-- AddForeignKey
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_treasuryId_communityId_fkey" FOREIGN KEY ("treasuryId", "communityId") REFERENCES "CommunityTreasury"("id", "communityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityTreasury" ADD CONSTRAINT "CommunityTreasury_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryOperation" ADD CONSTRAINT "TreasuryOperation_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryOperation" ADD CONSTRAINT "TreasuryOperation_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryOperation" ADD CONSTRAINT "TreasuryOperation_sourceTreasuryId_communityId_fkey" FOREIGN KEY ("sourceTreasuryId", "communityId") REFERENCES "CommunityTreasury"("id", "communityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryOperation" ADD CONSTRAINT "TreasuryOperation_destinationTreasuryId_communityId_fkey" FOREIGN KEY ("destinationTreasuryId", "communityId") REFERENCES "CommunityTreasury"("id", "communityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryLedgerEntry" ADD CONSTRAINT "TreasuryLedgerEntry_treasuryId_communityId_fkey" FOREIGN KEY ("treasuryId", "communityId") REFERENCES "CommunityTreasury"("id", "communityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryLedgerEntry" ADD CONSTRAINT "TreasuryLedgerEntry_operationId_communityId_fkey" FOREIGN KEY ("operationId", "communityId") REFERENCES "TreasuryOperation"("id", "communityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollComment" ADD CONSTRAINT "PollComment_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollComment" ADD CONSTRAINT "PollComment_parentId_pollId_fkey" FOREIGN KEY ("parentId", "pollId") REFERENCES "PollComment"("id", "pollId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollComment" ADD CONSTRAINT "PollComment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollComment" ADD CONSTRAINT "PollComment_authorPollVoterAccessId_fkey" FOREIGN KEY ("authorPollVoterAccessId") REFERENCES "PollVoterAccess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollComment" ADD CONSTRAINT "PollComment_hiddenByUserId_fkey" FOREIGN KEY ("hiddenByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma does not describe these integrity checks/triggers. Keep them when upgrading.
ALTER TABLE "CommunityTreasury" ADD CONSTRAINT "CommunityTreasury_recorded_amounts_check" CHECK (
    "currency" = 'ZEC' AND
    "availableZat" BETWEEN 0 AND 2100000000000000 AND
    "reservedZat" BETWEEN 0 AND 2100000000000000 AND
    "committedZat" BETWEEN 0 AND 2100000000000000 AND
    "paidZat" BETWEEN 0 AND 2100000000000000
);

ALTER TABLE "TreasuryOperation" ADD CONSTRAINT "TreasuryOperation_shape_check" CHECK (
    "currency" = 'ZEC' AND "amountZat" BETWEEN 1 AND 2100000000000000 AND
    length(btrim("reason")) BETWEEN 3 AND 500 AND length(btrim("actorLabel")) > 0 AND
    "idempotencyKey" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND
    "payloadHash" ~ '^[0-9a-f]{64}$' AND (
      ("kind" = 'FUNDING' AND "sourceTreasuryId" IS NULL AND "fundingSource" IS NOT NULL AND length(btrim("fundingSource")) BETWEEN 3 AND 200) OR
      ("kind" = 'ALLOCATION' AND "sourceTreasuryId" IS NOT NULL AND "sourceTreasuryId" <> "destinationTreasuryId" AND "fundingSource" IS NULL)
    )
);

ALTER TABLE "TreasuryLedgerEntry" ADD CONSTRAINT "TreasuryLedgerEntry_delta_check" CHECK (
    "deltaZat" <> 0 AND "deltaZat" BETWEEN -2100000000000000 AND 2100000000000000
);

ALTER TABLE "Poll" ADD CONSTRAINT "Poll_funding_request_check" CHECK (
    ("treasuryId" IS NULL AND "requestedAmountZat" IS NULL) OR
    ("treasuryId" IS NOT NULL AND "communityId" IS NOT NULL AND "requestedAmountZat" IS NOT NULL AND "requestedAmountZat" BETWEEN 1 AND 2100000000000000)
);
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_content_hash_version_check" CHECK (
    "contentHashVersion" IS NULL OR "contentHashVersion" = 'PROPOSAL_CONTENT_V1'
);

ALTER TABLE "PollComment" ADD CONSTRAINT "PollComment_author_check" CHECK (
    ("authorUserId" IS NOT NULL) <> ("authorPollVoterAccessId" IS NOT NULL)
);
ALTER TABLE "PollComment" ADD CONSTRAINT "PollComment_moderation_check" CHECK (
    ("hiddenAt" IS NULL AND "hiddenByUserId" IS NULL AND "hiddenByLabel" IS NULL AND "hideReason" IS NULL) OR
    ("hiddenAt" IS NOT NULL AND "hiddenByUserId" IS NOT NULL AND "hiddenByLabel" IS NOT NULL AND length(btrim("hiddenByLabel")) > 0 AND "hideReason" IS NOT NULL AND length(btrim("hideReason")) BETWEEN 1 AND 500)
);

-- Accounting history is append-only. Corrections must be new supported operations.
CREATE FUNCTION community_workspace_journal_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Recorded treasury history cannot be changed or deleted';
END;
$$;
CREATE TRIGGER "TreasuryOperation_immutable" BEFORE UPDATE OR DELETE ON "TreasuryOperation"
    FOR EACH ROW EXECUTE FUNCTION community_workspace_journal_immutable();
CREATE TRIGGER "TreasuryLedgerEntry_immutable" BEFORE UPDATE OR DELETE ON "TreasuryLedgerEntry"
    FOR EACH ROW EXECUTE FUNCTION community_workspace_journal_immutable();

-- Check the completed journal at commit, after both sides have been inserted.
CREATE FUNCTION community_workspace_journal_complete() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE CONSTRAINT TRIGGER "TreasuryOperation_journal_complete" AFTER INSERT ON "TreasuryOperation"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION community_workspace_journal_complete();
CREATE CONSTRAINT TRIGGER "TreasuryLedgerEntry_journal_complete" AFTER INSERT ON "TreasuryLedgerEntry"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION community_workspace_journal_complete();

COMMIT;
