-- Apply after the proposal topic upgrade. No exchange rate or historical
-- conversion is assumed: existing ZEC requests and their commitments stay intact.
BEGIN;

ALTER TABLE "Poll" ADD COLUMN IF NOT EXISTS "requestedAmountUsdCents" BIGINT;

ALTER TABLE "Poll" DROP CONSTRAINT IF EXISTS "Poll_funding_request_check";
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_funding_request_check" CHECK (
  ("treasuryId" IS NULL AND "requestedAmountZat" IS NULL AND "requestedAmountUsdCents" IS NULL) OR
  ("treasuryId" IS NOT NULL AND "communityId" IS NOT NULL AND (
    ("requestedAmountUsdCents" IS NULL AND "requestedAmountZat" IS NOT NULL AND "requestedAmountZat" BETWEEN 1 AND 2100000000000000) OR
    ("requestedAmountZat" IS NULL AND "requestedAmountUsdCents" IS NOT NULL AND "requestedAmountUsdCents" > 0
      AND COALESCE("contentHashVersion" = 'PROPOSAL_CONTENT_V3', FALSE)
      AND "proposalBody" IS NOT NULL AND length(btrim("proposalBody")) > 0)
  ))
);

ALTER TABLE "Poll" DROP CONSTRAINT IF EXISTS "Poll_content_hash_version_check";
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_content_hash_version_check" CHECK (
  "contentHashVersion" IS NULL OR "contentHashVersion" IN ('PROPOSAL_CONTENT_V1', 'PROPOSAL_CONTENT_V2', 'PROPOSAL_CONTENT_V3')
);

ALTER TABLE "Poll" DROP CONSTRAINT IF EXISTS "Poll_tagged_content_version_check";
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_tagged_content_version_check" CHECK (
  cardinality("proposalTags") = 0 OR (
    COALESCE("contentHashVersion" IN ('PROPOSAL_CONTENT_V2', 'PROPOSAL_CONTENT_V3'), FALSE)
    AND "communityId" IS NOT NULL
    AND "proposalBody" IS NOT NULL AND length(btrim("proposalBody")) > 0
  )
);

CREATE OR REPLACE FUNCTION proposal_funding_draft_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD."requestedAmountUsdCents" IS DISTINCT FROM NEW."requestedAmountUsdCents"
      OR OLD."requestedAmountZat" IS DISTINCT FROM NEW."requestedAmountZat"
      OR OLD."treasuryId" IS DISTINCT FROM NEW."treasuryId")
      AND (OLD."status" <> 'DRAFT' OR OLD."anchorTxid" IS NOT NULL) THEN
    RAISE EXCEPTION 'Published proposal funding cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS "Poll_proposal_funding_draft_only" ON "Poll";
CREATE TRIGGER "Poll_proposal_funding_draft_only" BEFORE UPDATE ON "Poll"
  FOR EACH ROW EXECUTE FUNCTION proposal_funding_draft_only();

COMMIT;
