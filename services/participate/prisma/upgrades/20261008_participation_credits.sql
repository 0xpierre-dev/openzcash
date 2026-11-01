-- Additive upgrade after account settings/workspace. Apply once to the prior
-- schema, with a backup. No credits, charges, reactions or treasury entries are
-- created. Existing communities remain FREE and legacy comment keys remain NULL.
-- SQL journal constraints/triggers are required; Prisma db push alone omits them.
BEGIN;

-- CreateEnum
CREATE TYPE "ParticipationMode" AS ENUM ('FREE', 'CREDITS');

-- CreateEnum
CREATE TYPE "CreditOperationKind" AS ENUM ('PREVIEW_GRANT', 'COMMENT', 'REACTION');

-- AlterTable
ALTER TABLE "Community" ADD COLUMN     "commentCost" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "participationMode" "ParticipationMode" NOT NULL DEFAULT 'FREE',
ADD COLUMN     "participationPolicyVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "reactionCost" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "PollComment" ADD COLUMN     "requestHash" TEXT,
ADD COLUMN     "requestKey" TEXT;

-- CreateTable
CREATE TABLE "CreditAccount" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditOperation" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "CreditOperationKind" NOT NULL,
    "delta" INTEGER NOT NULL,
    "requestKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "targetId" TEXT,
    "policyVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollCommentReaction" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "actorKey" TEXT NOT NULL,
    "authorUserId" TEXT,
    "authorPollVoterAccessId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "chargedBefore" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PollCommentReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollCommentReactionRequest" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "actorKey" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "liked" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollCommentReactionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditAccount_userId_createdAt_idx" ON "CreditAccount"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreditAccount_communityId_userId_key" ON "CreditAccount"("communityId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditAccount_id_communityId_userId_key" ON "CreditAccount"("id", "communityId", "userId");

-- CreateIndex
CREATE INDEX "CreditOperation_userId_communityId_createdAt_idx" ON "CreditOperation"("userId", "communityId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreditOperation_accountId_requestKey_key" ON "CreditOperation"("accountId", "requestKey");

-- CreateIndex
CREATE INDEX "PollCommentReaction_pollId_active_idx" ON "PollCommentReaction"("pollId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "PollCommentReaction_commentId_actorKey_key" ON "PollCommentReaction"("commentId", "actorKey");

-- CreateIndex
CREATE INDEX "PollCommentReactionRequest_commentId_createdAt_idx" ON "PollCommentReactionRequest"("commentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PollCommentReactionRequest_pollId_actorKey_requestKey_key" ON "PollCommentReactionRequest"("pollId", "actorKey", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "PollVoterAccess_id_pollId_key" ON "PollVoterAccess"("id", "pollId");

-- CreateIndex
CREATE UNIQUE INDEX "PollComment_pollId_authorUserId_requestKey_key" ON "PollComment"("pollId", "authorUserId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "PollComment_pollId_authorPollVoterAccessId_requestKey_key" ON "PollComment"("pollId", "authorPollVoterAccessId", "requestKey");

-- AddForeignKey
ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditOperation" ADD CONSTRAINT "CreditOperation_accountId_communityId_userId_fkey" FOREIGN KEY ("accountId", "communityId", "userId") REFERENCES "CreditAccount"("id", "communityId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollCommentReaction" ADD CONSTRAINT "PollCommentReaction_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollCommentReaction" ADD CONSTRAINT "PollCommentReaction_commentId_pollId_fkey" FOREIGN KEY ("commentId", "pollId") REFERENCES "PollComment"("id", "pollId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollCommentReaction" ADD CONSTRAINT "PollCommentReaction_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollCommentReaction" ADD CONSTRAINT "PollCommentReaction_authorPollVoterAccessId_pollId_fkey" FOREIGN KEY ("authorPollVoterAccessId", "pollId") REFERENCES "PollVoterAccess"("id", "pollId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollCommentReactionRequest" ADD CONSTRAINT "PollCommentReactionRequest_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollCommentReactionRequest" ADD CONSTRAINT "PollCommentReactionRequest_commentId_pollId_fkey" FOREIGN KEY ("commentId", "pollId") REFERENCES "PollComment"("id", "pollId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Community" ADD CONSTRAINT "Community_participation_policy_check" CHECK (
  "commentCost" BETWEEN 1 AND 100 AND "reactionCost" BETWEEN 1 AND 100
  AND "participationPolicyVersion" > 0
);
ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_balance_check" CHECK ("balance" BETWEEN 0 AND 1000000000);
ALTER TABLE "CreditOperation" ADD CONSTRAINT "CreditOperation_shape_check" CHECK (
  char_length("requestKey") BETWEEN 1 AND 128 AND "payloadHash" ~ '^[a-f0-9]{64}$'
  AND "policyVersion" > 0
  AND (("kind" = 'PREVIEW_GRANT' AND "delta" = 25 AND "targetId" IS NULL AND "requestKey" = 'preview-grant:v1')
    OR ("kind" IN ('COMMENT', 'REACTION') AND "delta" BETWEEN -100 AND -1
      AND "targetId" IS NOT NULL AND char_length("targetId") BETWEEN 1 AND 128))
);
CREATE UNIQUE INDEX "CreditOperation_one_preview_grant" ON "CreditOperation" ("accountId") WHERE "kind" = 'PREVIEW_GRANT';
ALTER TABLE "PollComment" ADD CONSTRAINT "PollComment_request_check" CHECK (
  ("requestKey" IS NULL AND "requestHash" IS NULL)
  OR ("requestKey" IS NOT NULL AND "requestHash" IS NOT NULL
    AND char_length("requestKey") BETWEEN 1 AND 128 AND "requestHash" ~ '^[a-f0-9]{64}$')
);
ALTER TABLE "PollCommentReaction" ADD CONSTRAINT "PollCommentReaction_actor_check" CHECK (
  ("authorUserId" IS NOT NULL AND "authorPollVoterAccessId" IS NULL AND "actorKey" = 'user:' || "authorUserId")
  OR ("authorUserId" IS NULL AND "authorPollVoterAccessId" IS NOT NULL AND "actorKey" = 'access:' || "authorPollVoterAccessId")
);
ALTER TABLE "PollCommentReactionRequest" ADD CONSTRAINT "PollCommentReactionRequest_shape_check" CHECK (
  "actorKey" ~ '^(user|access):[^[:space:]]+$' AND char_length("actorKey") <= 160
  AND char_length("requestKey") BETWEEN 1 AND 128 AND "payloadHash" ~ '^[a-f0-9]{64}$'
);

CREATE FUNCTION participation_credit_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Participation history is append-only';
END $$;
CREATE TRIGGER "CreditOperation_immutable" BEFORE UPDATE OR DELETE ON "CreditOperation"
  FOR EACH ROW EXECUTE FUNCTION participation_credit_history_immutable();
CREATE TRIGGER "PollCommentReactionRequest_immutable" BEFORE UPDATE OR DELETE ON "PollCommentReactionRequest"
  FOR EACH ROW EXECUTE FUNCTION participation_credit_history_immutable();

CREATE FUNCTION participation_credit_balance_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  account_id TEXT;
  recorded INTEGER;
  journal BIGINT;
BEGIN
  IF TG_TABLE_NAME = 'CreditAccount' THEN account_id := NEW."id";
  ELSE account_id := NEW."accountId"; END IF;
  SELECT "balance" INTO recorded FROM "CreditAccount" WHERE "id" = account_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT COALESCE(SUM("delta"), 0) INTO journal FROM "CreditOperation" WHERE "accountId" = account_id;
  IF recorded <> journal THEN RAISE EXCEPTION 'Participation credit balance does not match its journal'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "CreditAccount_balance_complete" AFTER INSERT OR UPDATE ON "CreditAccount"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION participation_credit_balance_complete();
CREATE CONSTRAINT TRIGGER "CreditOperation_balance_complete" AFTER INSERT ON "CreditOperation"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION participation_credit_balance_complete();

CREATE FUNCTION participation_reaction_identity_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."pollId" IS DISTINCT FROM NEW."pollId" OR OLD."commentId" IS DISTINCT FROM NEW."commentId"
    OR OLD."actorKey" IS DISTINCT FROM NEW."actorKey" OR OLD."authorUserId" IS DISTINCT FROM NEW."authorUserId"
    OR OLD."authorPollVoterAccessId" IS DISTINCT FROM NEW."authorPollVoterAccessId"
    OR (OLD."chargedBefore" AND NOT NEW."chargedBefore") THEN
    RAISE EXCEPTION 'Participation reaction identity and prior charge cannot be changed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "PollCommentReaction_identity_immutable" BEFORE UPDATE ON "PollCommentReaction"
  FOR EACH ROW EXECUTE FUNCTION participation_reaction_identity_immutable();
COMMIT;
