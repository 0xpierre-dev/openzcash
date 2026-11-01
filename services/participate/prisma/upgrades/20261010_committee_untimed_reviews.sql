BEGIN;
-- Existing immutable round manifests and their deadlines remain untouched.
-- Only new V4 committee rounds can omit the deadline.
ALTER TABLE "SignedDecisionRound" ALTER COLUMN "closesAt" DROP NOT NULL;
ALTER TABLE "SignedDecisionRound" ADD CONSTRAINT "signed_round_deadline_by_format"
  CHECK (CASE WHEN "manifestJson"::jsonb ->> 'schema' = 'PARTICIPATE_DECISION_ROUND_V4'
    THEN "closesAt" IS NULL
    ELSE "closesAt" IS NOT NULL END);
COMMIT;
