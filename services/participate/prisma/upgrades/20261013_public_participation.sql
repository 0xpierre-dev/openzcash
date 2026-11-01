-- New publications are real community records. Retain every legacy test and immutable guard.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE "ProposalSubmission" DROP CONSTRAINT "ProposalSubmission_state_check";
ALTER TABLE "ProposalSubmission" DROP CONSTRAINT "ProposalSubmission_check";
ALTER TABLE "ProposalSubmission" ADD CONSTRAINT "ProposalSubmission_state_check"
  CHECK ("state" IN ('DRAFT', 'PUBLISHED_DEMO', 'PUBLISHED'));
ALTER TABLE "ProposalSubmission" ADD CONSTRAINT "ProposalSubmission_check" CHECK (
  ("state" = 'DRAFT' AND "requestKey" IS NULL AND "recordId" IS NULL AND "submittedAt" IS NULL)
  OR ("state" IN ('PUBLISHED_DEMO', 'PUBLISHED') AND "requestKey" IS NOT NULL AND "recordId" IS NOT NULL AND "submittedAt" IS NOT NULL)
);
COMMIT;
