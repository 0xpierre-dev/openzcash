-- Allow replies to any existing visible comment in the same archive.
-- Parent links, bodies and timestamps remain immutable; no rows are rewritten.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION zvoice_archive_comment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Comments must be retained'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."parentId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ArchiveComment" p WHERE p."id" = NEW."parentId" AND p."archiveId" = NEW."archiveId" AND p."hiddenAt" IS NULL) THEN RAISE EXCEPTION 'Invalid reply'; END IF;
    RETURN NEW;
  END IF;
  IF (NEW."id", NEW."archiveId", NEW."authorId", NEW."authorLabel", NEW."body", NEW."parentId", NEW."requestKey", NEW."createdAt") IS DISTINCT FROM (OLD."id", OLD."archiveId", OLD."authorId", OLD."authorLabel", OLD."body", OLD."parentId", OLD."requestKey", OLD."createdAt") OR OLD."hiddenAt" IS NOT NULL OR NEW."hiddenAt" IS NULL THEN RAISE EXCEPTION 'Only initial moderation is permitted'; END IF;
  RETURN NEW;
END;
$$;
COMMIT;
