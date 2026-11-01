-- Preserve every original body, event, receipt and charge. Back up before applying.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
ALTER TABLE "ArchiveComment" ADD COLUMN "currentVersion" INTEGER NOT NULL DEFAULT 1 CHECK ("currentVersion" BETWEEN 1 AND 50),
  ADD COLUMN "withdrawnAt" TIMESTAMP(3), ADD COLUMN "withdrawalKey" TEXT,
  ADD CONSTRAINT "ArchiveComment_withdrawal_pair" CHECK (("withdrawnAt" IS NULL) = ("withdrawalKey" IS NULL));
CREATE TABLE "ArchiveCommentVersion" (
  "id" TEXT PRIMARY KEY, "commentId" TEXT NOT NULL REFERENCES "ArchiveComment"("id") ON DELETE RESTRICT,
  "version" INTEGER NOT NULL CHECK ("version" BETWEEN 1 AND 50), "body" TEXT NOT NULL CHECK (length("body") BETWEEN 1 AND 4000),
  "bodyHash" TEXT NOT NULL CHECK ("bodyHash" = encode(sha256(convert_to("body", 'UTF8')), 'hex')),
  "previousBodyHash" TEXT, "requestKey" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("commentId", "version"), UNIQUE ("commentId", "requestKey")
);
INSERT INTO "ArchiveCommentVersion" ("id", "commentId", "version", "body", "bodyHash", "requestKey", "createdAt")
  SELECT 'initial:' || "id", "id", 1, "body", encode(sha256(convert_to("body", 'UTF8')), 'hex'), "requestKey", "createdAt" FROM "ArchiveComment";
CREATE TRIGGER "ArchiveCommentVersion_immutable" BEFORE UPDATE OR DELETE ON "ArchiveCommentVersion" FOR EACH ROW EXECUTE FUNCTION zvoice_archive_immutable();
CREATE FUNCTION archive_comment_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE comment "ArchiveComment"; prior "ArchiveCommentVersion";
BEGIN
  SELECT * INTO comment FROM "ArchiveComment" WHERE "id" = NEW."commentId" FOR UPDATE;
  IF NEW."version" = 1 THEN
    IF NEW."body" <> comment."body" OR NEW."requestKey" <> comment."requestKey" OR NEW."createdAt" <> comment."createdAt" OR NEW."previousBodyHash" IS NOT NULL THEN RAISE EXCEPTION 'Initial comment version mismatch'; END IF;
  ELSE
    SELECT * INTO prior FROM "ArchiveCommentVersion" WHERE "commentId" = NEW."commentId" AND "version" = comment."currentVersion";
    IF comment."hiddenAt" IS NOT NULL OR comment."withdrawnAt" IS NOT NULL OR NEW."version" <> comment."currentVersion" + 1 OR NEW."previousBodyHash" IS DISTINCT FROM prior."bodyHash" OR NEW."createdAt" < prior."createdAt" THEN RAISE EXCEPTION 'Invalid comment revision'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "ArchiveCommentVersion_guard" BEFORE INSERT ON "ArchiveCommentVersion" FOR EACH ROW EXECUTE FUNCTION archive_comment_version_guard();
-- Also covers writes from the previous app during a rolling deployment.
CREATE FUNCTION archive_comment_initial_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "ArchiveCommentVersion" ("id","commentId","version","body","bodyHash","requestKey","createdAt") VALUES
    ('initial:' || NEW."id", NEW."id", 1, NEW."body", encode(sha256(convert_to(NEW."body",'UTF8')),'hex'), NEW."requestKey", NEW."createdAt");
  RETURN NEW;
END $$;
CREATE TRIGGER "ArchiveComment_initial_version" AFTER INSERT ON "ArchiveComment" FOR EACH ROW EXECUTE FUNCTION archive_comment_initial_version();
CREATE OR REPLACE FUNCTION zvoice_archive_comment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Comments must be retained'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."currentVersion" <> 1 OR NEW."withdrawnAt" IS NOT NULL OR NEW."hiddenAt" IS NOT NULL THEN RAISE EXCEPTION 'Invalid initial comment'; END IF;
    IF NEW."parentId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ArchiveComment" p WHERE p."id" = NEW."parentId" AND p."archiveId" = NEW."archiveId" AND p."hiddenAt" IS NULL AND p."withdrawnAt" IS NULL) THEN RAISE EXCEPTION 'Invalid reply'; END IF;
    RETURN NEW;
  END IF;
  IF (NEW."id", NEW."archiveId", NEW."authorId", NEW."authorLabel", NEW."body", NEW."parentId", NEW."requestKey", NEW."createdAt") IS DISTINCT FROM (OLD."id", OLD."archiveId", OLD."authorId", OLD."authorLabel", OLD."body", OLD."parentId", OLD."requestKey", OLD."createdAt") THEN RAISE EXCEPTION 'Comment identity is immutable'; END IF;
  IF (NEW."hiddenAt", NEW."hiddenById", NEW."hiddenByLabel", NEW."hideReason") IS DISTINCT FROM (OLD."hiddenAt", OLD."hiddenById", OLD."hiddenByLabel", OLD."hideReason") THEN
    IF OLD."hiddenAt" IS NOT NULL OR NEW."hiddenAt" IS NULL OR (NEW."currentVersion",NEW."withdrawnAt",NEW."withdrawalKey") IS DISTINCT FROM (OLD."currentVersion",OLD."withdrawnAt",OLD."withdrawalKey") THEN RAISE EXCEPTION 'Invalid moderation'; END IF;
  ELSIF NEW."currentVersion" <> OLD."currentVersion" THEN
    IF OLD."hiddenAt" IS NOT NULL OR OLD."withdrawnAt" IS NOT NULL OR NEW."currentVersion" <> OLD."currentVersion" + 1 OR NEW."withdrawnAt" IS NOT NULL OR NOT EXISTS (SELECT 1 FROM "ArchiveCommentVersion" v WHERE v."commentId" = NEW."id" AND v."version" = NEW."currentVersion") THEN RAISE EXCEPTION 'Invalid revision pointer'; END IF;
  ELSIF (NEW."withdrawnAt",NEW."withdrawalKey") IS DISTINCT FROM (OLD."withdrawnAt",OLD."withdrawalKey") THEN
    IF OLD."hiddenAt" IS NOT NULL OR OLD."withdrawnAt" IS NOT NULL OR NEW."withdrawnAt" IS NULL THEN RAISE EXCEPTION 'Invalid withdrawal'; END IF;
  END IF;
  RETURN NEW;
END $$;
ALTER TABLE "ArchiveReaction" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ArchiveReaction" DROP CONSTRAINT "ArchiveReaction_pkey", ADD PRIMARY KEY ("commentId", "userId", "version"),
  ADD FOREIGN KEY ("commentId", "version") REFERENCES "ArchiveCommentVersion"("commentId", "version") ON DELETE RESTRICT;
ALTER TABLE "ArchiveReactionRequest" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD FOREIGN KEY ("commentId", "version") REFERENCES "ArchiveCommentVersion"("commentId", "version") ON DELETE RESTRICT;
ALTER TABLE "ArchiveActivityBatch" ADD COLUMN "pool" TEXT NOT NULL DEFAULT 'sapling' CHECK ("pool" IN ('sapling','ironwood'));
CREATE TABLE "ArchiveDiscussionClosure" (
  "id" TEXT PRIMARY KEY, "archiveId" TEXT NOT NULL REFERENCES "ProposalArchive"("id") ON DELETE RESTRICT,
  "revisionId" TEXT NOT NULL UNIQUE REFERENCES "ArchiveRevision"("id") ON DELETE RESTRICT,
  "snapshotHash" TEXT NOT NULL UNIQUE, "snapshotJson" TEXT NOT NULL CHECK (octet_length("snapshotJson") <= 8000000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("snapshotHash" = encode(sha256(convert_to("snapshotJson", 'UTF8')), 'hex'))
);
CREATE INDEX "ArchiveDiscussionClosure_archiveId_createdAt_idx" ON "ArchiveDiscussionClosure"("archiveId","createdAt");
CREATE TRIGGER "ArchiveDiscussionClosure_immutable" BEFORE UPDATE OR DELETE ON "ArchiveDiscussionClosure" FOR EACH ROW EXECUTE FUNCTION zvoice_archive_immutable();
CREATE TABLE "ActivityAutomationJob" (
  "batchId" TEXT PRIMARY KEY REFERENCES "ArchiveActivityBatch"("id") ON DELETE RESTRICT,
  "state" TEXT NOT NULL DEFAULT 'PREPARED' CHECK ("state" IN ('PREPARED','DISPATCHED','CONFIRMING','VERIFIED','NEEDS_REVIEW')),
  "attempts" INTEGER NOT NULL DEFAULT 0, "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastErrorCode" TEXT, "feeZat" INTEGER CHECK ("feeZat" BETWEEN 1 AND 50000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ActivityAutomationJob_state_nextAttemptAt_idx" ON "ActivityAutomationJob"("state","nextAttemptAt");
CREATE OR REPLACE FUNCTION archive_activity_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior "ArchiveActivityEvent"; archive "ProposalArchive"; payload JSONB; valid_actor BOOLEAN;
BEGIN
  SELECT * INTO archive FROM "ProposalArchive" WHERE "id" = NEW."archiveId" FOR UPDATE;
  SELECT * INTO prior FROM "ArchiveActivityEvent" WHERE "archiveId" = NEW."archiveId" ORDER BY "sequence" DESC LIMIT 1;
  payload := NEW."eventJson"::jsonb;
  IF payload->>'kind' = 'DISCUSSION_CLOSED' THEN
    valid_actor := payload->>'actor' = 'SOURCE_OBSERVER' AND payload->>'authority' = 'OFFICIAL_SOURCE'
      AND EXISTS (SELECT 1 FROM "ArchiveDiscussionClosure" c JOIN "ArchiveRevision" r ON r."id" = c."revisionId" WHERE c."archiveId" = NEW."archiveId" AND c."snapshotHash" = payload->>'snapshotHash' AND r."archiveId" = NEW."archiveId" AND r."manifestHash" = payload->>'proposalManifestHash');
  ELSE
    valid_actor := EXISTS (SELECT 1 FROM "ArchiveActivityActor" a WHERE a."id" = payload->>'actor' AND a."archiveId" = NEW."archiveId");
  END IF;
  IF NEW."sequence" <> COALESCE(prior."sequence", 0) + 1 OR payload->>'previousEventHash' IS DISTINCT FROM prior."eventHash"
    OR payload->>'id' IS DISTINCT FROM NEW."id" OR (payload->>'sequence')::integer IS DISTINCT FROM NEW."sequence"
    OR payload->>'recordId' IS DISTINCT FROM archive."recordId" OR payload->>'communityId' IS DISTINCT FROM archive."communityId"
    OR payload->>'schema' IS DISTINCT FROM 'PARTICIPATE_EVENT_V1' OR NOT COALESCE(valid_actor,false)
    OR NOT EXISTS (SELECT 1 FROM "ArchiveRevision" r WHERE r."archiveId" = NEW."archiveId" AND r."manifestHash" = payload->>'proposalManifestHash') THEN RAISE EXCEPTION 'Invalid activity event chain'; END IF;
  RETURN NEW;
END $$;
COMMIT;
