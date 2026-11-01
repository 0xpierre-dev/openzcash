-- Additive native intake. No existing proposal, ballot, credit balance or anchor changes.
ALTER TYPE "CreditOperationKind" ADD VALUE IF NOT EXISTS 'PROPOSAL_SUBMISSION';
BEGIN;
ALTER TABLE "CreditOperation" DROP CONSTRAINT "CreditOperation_shape_check";
ALTER TABLE "CreditOperation" ADD CONSTRAINT "CreditOperation_shape_check" CHECK (
  char_length("requestKey") BETWEEN 1 AND 128 AND "payloadHash" ~ '^[a-f0-9]{64}$' AND "policyVersion" > 0
  AND (("kind" = 'PREVIEW_GRANT' AND "delta" = 25 AND "targetId" IS NULL AND "requestKey" = 'preview-grant:v1' AND "purchaseId" IS NULL)
    OR ("kind" IN ('COMMENT', 'REACTION') AND "delta" BETWEEN -100 AND -1 AND "targetId" IS NOT NULL AND char_length("targetId") BETWEEN 1 AND 128 AND "purchaseId" IS NULL)
    OR ("kind" = 'PROPOSAL_SUBMISSION' AND "delta" = -20 AND "targetId" IS NOT NULL AND char_length("targetId") BETWEEN 1 AND 128 AND "purchaseId" IS NULL AND "policyVersion" = 1)
    OR ("kind" = 'PURCHASE' AND "delta" BETWEEN 1 AND 1000000 AND "purchaseId" IS NOT NULL AND "targetId" = "purchaseId"))
);
CREATE TABLE "ProposalSubmission" (
  "id" TEXT PRIMARY KEY,
  "communityId" TEXT NOT NULL REFERENCES "Community"("id") ON DELETE RESTRICT,
  "committeeId" TEXT NOT NULL REFERENCES "Community"("id") ON DELETE RESTRICT,
  "authorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "payload" JSONB NOT NULL,
  "contentHash" TEXT NOT NULL CHECK ("contentHash" ~ '^[a-f0-9]{64}$'),
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "state" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("state" IN ('DRAFT', 'PUBLISHED_DEMO')),
  "requestKey" TEXT,
  "recordId" TEXT UNIQUE,
  "submittedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CHECK (("state" = 'DRAFT' AND "requestKey" IS NULL AND "recordId" IS NULL AND "submittedAt" IS NULL)
    OR ("state" = 'PUBLISHED_DEMO' AND "requestKey" IS NOT NULL AND "recordId" IS NOT NULL AND "submittedAt" IS NOT NULL))
);
CREATE INDEX "ProposalSubmission_authorId_communityId_updatedAt_idx" ON "ProposalSubmission"("authorId", "communityId", "updatedAt");
CREATE FUNCTION proposal_submission_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD."state" <> 'DRAFT' THEN RAISE EXCEPTION 'Published submissions are immutable'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' AND (OLD."state" <> 'DRAFT' OR OLD."communityId" <> NEW."communityId"
    OR OLD."committeeId" <> NEW."committeeId" OR OLD."authorId" <> NEW."authorId" OR OLD."id" <> NEW."id")
    THEN RAISE EXCEPTION 'Submission ownership and published contents are immutable'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "Community" WHERE "id" = NEW."committeeId" AND "kind" = 'COMMITTEE')
    THEN RAISE EXCEPTION 'A submission requires a committee scope'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "ProposalSubmission_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ProposalSubmission"
  FOR EACH ROW EXECUTE FUNCTION proposal_submission_guard();
COMMIT;
