-- Add proposal topics without changing any existing ballot or content hash.
-- Apply after the community workspace upgrades, or after a fresh Prisma schema
-- and the workspace integrity installer. Safe to rerun; no proposal backfill.
BEGIN;

ALTER TABLE "Poll" ADD COLUMN IF NOT EXISTS "proposalTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Poll" ALTER COLUMN "proposalTags" SET NOT NULL,
  ALTER COLUMN "proposalTags" SET DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "Poll" DROP CONSTRAINT IF EXISTS "Poll_content_hash_version_check";
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_content_hash_version_check" CHECK (
  "contentHashVersion" IS NULL OR "contentHashVersion" IN ('PROPOSAL_CONTENT_V1', 'PROPOSAL_CONTENT_V2')
);

CREATE OR REPLACE FUNCTION valid_proposal_topics(tags TEXT[]) RETURNS BOOLEAN LANGUAGE SQL IMMUTABLE STRICT AS $$
  SELECT cardinality(tags) <= 3
    AND (cardinality(tags) = 0 OR (array_ndims(tags) = 1 AND array_lower(tags, 1) = 1))
    AND array_position(tags, NULL) IS NULL
    AND tags <@ ARRAY['security', 'infrastructure', 'community', 'education', 'applications',
      'integration', 'wallets', 'research', 'media', 'protocol', 'operations', 'events', 'retroactive']::TEXT[]
    AND cardinality(tags) = (SELECT count(DISTINCT topic) FROM unnest(tags) AS topic);
$$;

ALTER TABLE "Poll" DROP CONSTRAINT IF EXISTS "Poll_proposal_tags_check";
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_proposal_tags_check" CHECK (valid_proposal_topics("proposalTags"));
ALTER TABLE "Poll" DROP CONSTRAINT IF EXISTS "Poll_tagged_content_version_check";
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_tagged_content_version_check" CHECK (
  cardinality("proposalTags") = 0 OR (
    COALESCE("contentHashVersion" = 'PROPOSAL_CONTENT_V2', FALSE)
    AND "communityId" IS NOT NULL
    AND "proposalBody" IS NOT NULL
    AND length(btrim("proposalBody")) > 0
  )
);

CREATE OR REPLACE FUNCTION proposal_topics_draft_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."proposalTags" IS DISTINCT FROM NEW."proposalTags" AND OLD."status" <> 'DRAFT' THEN
    RAISE EXCEPTION 'Published proposal topics cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS "Poll_proposal_tags_draft_only" ON "Poll";
CREATE TRIGGER "Poll_proposal_tags_draft_only" BEFORE UPDATE ON "Poll"
  FOR EACH ROW EXECUTE FUNCTION proposal_topics_draft_only();

COMMIT;
