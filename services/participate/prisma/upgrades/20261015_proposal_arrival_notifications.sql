-- Extend the private inbox only. No historical backfill or public/financial writes.
-- Run with psql ON_ERROR_STOP=1, without --single-transaction: the enum value
-- must commit before PostgreSQL can use it in the following CHECK constraint.
ALTER TYPE "DiscussionNotificationKind" ADD VALUE IF NOT EXISTS 'PROPOSAL_ARRIVED';
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE "DiscussionNotification"
  ALTER COLUMN "actorId" DROP NOT NULL,
  ALTER COLUMN "commentId" DROP NOT NULL,
  ADD COLUMN "archiveId" TEXT REFERENCES "ProposalArchive"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DiscussionNotification_target" CHECK (
    ("kind" = 'PROPOSAL_ARRIVED' AND "archiveId" IS NOT NULL AND "actorId" IS NULL AND "commentId" IS NULL)
    OR
    ("kind" IN ('COMMENT_LIKED', 'COMMENT_REPLIED') AND "archiveId" IS NULL AND "actorId" IS NOT NULL AND "commentId" IS NOT NULL)
  );
CREATE UNIQUE INDEX "DiscussionNotification_kind_recipientId_archiveId_key"
  ON "DiscussionNotification"("kind", "recipientId", "archiveId");
COMMIT;
