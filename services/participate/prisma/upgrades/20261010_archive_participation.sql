-- Additive: run after proposal_archives and participation_credits, with a backup.
-- Preserves existing free interactions and creates no charges or grants.
BEGIN;
ALTER TABLE "ArchiveReaction" ADD COLUMN "chargedBefore" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "ArchiveProposalLike" (
  "archiveId" TEXT NOT NULL REFERENCES "ProposalArchive"("id") ON DELETE RESTRICT,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "liked" BOOLEAN NOT NULL,
  "chargedBefore" BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY ("archiveId", "userId")
);
CREATE TABLE "ArchiveProposalLikeRequest" (
  "id" TEXT PRIMARY KEY,
  "archiveId" TEXT NOT NULL REFERENCES "ProposalArchive"("id") ON DELETE RESTRICT,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "requestKey" TEXT NOT NULL CHECK (length("requestKey") BETWEEN 1 AND 128),
  "liked" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("archiveId", "userId", "requestKey")
);
CREATE INDEX "ArchiveProposalLikeRequest_userId_createdAt_idx" ON "ArchiveProposalLikeRequest"("userId", "createdAt");
CREATE TRIGGER "ArchiveProposalLikeRequest_immutable" BEFORE UPDATE OR DELETE ON "ArchiveProposalLikeRequest"
  FOR EACH ROW EXECUTE FUNCTION participation_credit_history_immutable();

CREATE FUNCTION archive_participation_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Reaction history must be retained'; END IF;
  IF (to_jsonb(OLD) - 'liked' - 'chargedBefore') IS DISTINCT FROM (to_jsonb(NEW) - 'liked' - 'chargedBefore')
    OR (OLD."chargedBefore" AND NOT NEW."chargedBefore") THEN
    RAISE EXCEPTION 'Reaction identity and prior charges are immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "ArchiveReaction_identity_guard" BEFORE UPDATE OR DELETE ON "ArchiveReaction"
  FOR EACH ROW EXECUTE FUNCTION archive_participation_identity_guard();
CREATE TRIGGER "ArchiveProposalLike_identity_guard" BEFORE UPDATE OR DELETE ON "ArchiveProposalLike"
  FOR EACH ROW EXECUTE FUNCTION archive_participation_identity_guard();
COMMIT;
