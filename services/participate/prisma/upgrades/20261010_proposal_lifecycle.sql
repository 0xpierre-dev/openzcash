-- Apply after proposal_submissions and archive_activity. Published bytes stay intact.
BEGIN;
CREATE TABLE "ProposalDraftDeletion" (
  "id" TEXT PRIMARY KEY,
  "communityId" TEXT NOT NULL,
  "committeeId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "version" INTEGER NOT NULL CHECK ("version" > 0),
  "createdAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ProposalDraftDeletion_authorId_createdAt_idx" ON "ProposalDraftDeletion"("authorId", "createdAt");
CREATE TRIGGER "ProposalDraftDeletion_immutable" BEFORE UPDATE OR DELETE ON "ProposalDraftDeletion"
  FOR EACH ROW EXECUTE FUNCTION zvoice_archive_immutable();

CREATE OR REPLACE FUNCTION proposal_submission_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."state" <> 'DRAFT' THEN RAISE EXCEPTION 'Published submissions are immutable'; END IF;
    INSERT INTO "ProposalDraftDeletion" ("id", "communityId", "committeeId", "authorId", "version", "createdAt")
      VALUES (OLD."id", OLD."communityId", OLD."committeeId", OLD."authorId", OLD."version", OLD."createdAt");
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' AND EXISTS (SELECT 1 FROM "ProposalDraftDeletion" WHERE "id" = NEW."id")
    THEN RAISE EXCEPTION 'Deleted drafts cannot be recreated'; END IF;
  IF TG_OP = 'UPDATE' AND (OLD."state" <> 'DRAFT' OR OLD."communityId" <> NEW."communityId"
    OR OLD."committeeId" <> NEW."committeeId" OR OLD."authorId" <> NEW."authorId" OR OLD."id" <> NEW."id")
    THEN RAISE EXCEPTION 'Submission ownership and published contents are immutable'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "Community" WHERE "id" = NEW."committeeId" AND "kind" = 'COMMITTEE')
    THEN RAISE EXCEPTION 'A submission requires a committee scope'; END IF;
  RETURN NEW;
END $$;

CREATE TABLE "ProposalAbandonment" (
  "archiveId" TEXT PRIMARY KEY REFERENCES "ProposalArchive"("id") ON DELETE RESTRICT,
  "submissionId" TEXT NOT NULL UNIQUE REFERENCES "ProposalSubmission"("id") ON DELETE RESTRICT,
  "eventId" TEXT NOT NULL UNIQUE REFERENCES "ArchiveActivityEvent"("id") ON DELETE RESTRICT,
  "requestKey" TEXT NOT NULL CHECK (char_length("requestKey") = 36)
);
CREATE TRIGGER "ProposalAbandonment_immutable" BEFORE UPDATE OR DELETE ON "ProposalAbandonment"
  FOR EACH ROW EXECUTE FUNCTION zvoice_archive_immutable();
CREATE FUNCTION proposal_abandonment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "ProposalArchive" a
    JOIN "ProposalSubmission" s ON s."id" = NEW."submissionId" AND s."communityId" = a."communityId"
      AND s."committeeId" = a."committeeId" AND s."recordId" = a."recordId" AND s."state" = 'PUBLISHED_DEMO'
    JOIN "ArchiveActivityEvent" e ON e."id" = NEW."eventId" AND e."archiveId" = a."id"
    JOIN "ArchiveActivityActor" actor ON actor."archiveId" = a."id" AND actor."userId" = s."authorId"
      AND actor."id" = e."eventJson"::jsonb->>'actor'
    WHERE a."id" = NEW."archiveId" AND e."sourceKey" = 'proposal-abandoned'
      AND e."eventJson"::jsonb->>'kind' = 'PROPOSAL_ABANDONED'
      AND e."eventJson"::jsonb->>'authority' = 'AUTHOR_ACCOUNT'
      AND e."eventJson"::jsonb->>'origin' = 'LIVE'
  ) THEN RAISE EXCEPTION 'Abandonment requires the published author and a matching event'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "ProposalAbandonment_guard" BEFORE INSERT ON "ProposalAbandonment"
  FOR EACH ROW EXECUTE FUNCTION proposal_abandonment_guard();
COMMIT;
