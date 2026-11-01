-- Apply after proposal USD budgets and account membership, including fresh schemas.
BEGIN;
ALTER TABLE "Poll" DROP CONSTRAINT IF EXISTS "Poll_content_hash_version_check";
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_content_hash_version_check" CHECK (
  "contentHashVersion" IS NULL OR "contentHashVersion" IN ('PROPOSAL_CONTENT_V1', 'PROPOSAL_CONTENT_V2', 'PROPOSAL_CONTENT_V3', 'MEMBERSHIP_ACCOUNT_V1')
);
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_membership_shape_check" CHECK (
  "contentHashVersion" IS DISTINCT FROM 'MEMBERSHIP_ACCOUNT_V1' OR (
    "communityId" IS NOT NULL AND "audience" = 'DAO_MEMBERS' AND "voteModel" = 'SINGLE_CHOICE'
    AND "proposalBody" IS NULL AND cardinality("proposalTags") = 0
    AND "treasuryId" IS NULL AND "requestedAmountZat" IS NULL AND "requestedAmountUsdCents" IS NULL
    AND "optionDLabel" IS NULL AND "optionELabel" IS NULL
  )
);
COMMIT;
