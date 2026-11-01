BEGIN;
ALTER TABLE "ArchiveAnchor" ADD COLUMN "commitment" JSONB;
CREATE OR REPLACE FUNCTION zvoice_archive_anchor_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Anchor intents must be retained'; END IF;
  IF (NEW."id", NEW."revisionId", NEW."network", NEW."memo", NEW."receiver", NEW."createdAt", NEW."commitment") IS DISTINCT FROM (OLD."id", OLD."revisionId", OLD."network", OLD."memo", OLD."receiver", OLD."createdAt", OLD."commitment") THEN RAISE EXCEPTION 'Anchor identity is immutable'; END IF;
  IF NOT ((OLD."state" = 'PREPARED' AND NEW."state" = 'SUBMITTING') OR (OLD."state" = 'SUBMITTING' AND NEW."state" IN ('SUBMITTED','UNKNOWN')) OR (OLD."state" = 'SUBMITTED' AND NEW."state" IN ('BROADCAST','UNBROADCAST','FAILED','UNKNOWN'))) THEN RAISE EXCEPTION 'Invalid anchor transition'; END IF;
  IF OLD."operationId" IS NOT NULL AND NEW."operationId" IS DISTINCT FROM OLD."operationId" THEN RAISE EXCEPTION 'Operation identity is immutable'; END IF;
  RETURN NEW;
END;
$$;
COMMIT;
