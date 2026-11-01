-- Additive private inbox. Run after archive participation; no public records,
-- credit balances, existing comments or anchors are changed or backfilled.
BEGIN;
CREATE TYPE "DiscussionNotificationKind" AS ENUM ('COMMENT_LIKED', 'COMMENT_REPLIED');
CREATE TABLE "DiscussionNotification" (
  "id" TEXT PRIMARY KEY,
  "kind" "DiscussionNotificationKind" NOT NULL,
  "recipientId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "actorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "commentId" TEXT NOT NULL REFERENCES "ArchiveComment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMP(3),
  "withdrawnAt" TIMESTAMP(3),
  CONSTRAINT "DiscussionNotification_no_self" CHECK ("recipientId" <> "actorId")
);
CREATE UNIQUE INDEX "DiscussionNotification_kind_actorId_commentId_key" ON "DiscussionNotification"("kind", "actorId", "commentId");
CREATE INDEX "DiscussionNotification_recipientId_createdAt_id_idx" ON "DiscussionNotification"("recipientId", "createdAt", "id");
CREATE INDEX "DiscussionNotification_recipientId_readAt_withdrawnAt_idx" ON "DiscussionNotification"("recipientId", "readAt", "withdrawnAt");
COMMIT;
