-- Additive. Existing accounts, journals, invoices and revision bytes stay intact.
BEGIN;
CREATE TYPE "WorkspaceKind" AS ENUM ('DAO', 'COMMITTEE');
ALTER TABLE "Community" ADD COLUMN "kind" "WorkspaceKind" NOT NULL DEFAULT 'DAO';
ALTER TABLE "ProposalArchive" ADD COLUMN "committeeId" TEXT;
ALTER TABLE "ProposalArchive" ADD CONSTRAINT "ProposalArchive_committeeId_fkey"
  FOREIGN KEY ("committeeId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ProposalArchive_committeeId_idx" ON "ProposalArchive"("committeeId");

CREATE FUNCTION proposal_committee_scope_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."committeeId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Community" WHERE "id" = NEW."committeeId" AND "kind" = 'COMMITTEE'
  ) THEN RAISE EXCEPTION 'Public committee records require a committee scope'; END IF;
  -- Initial assignment supports legacy hosted records; later changes need an
  -- explicit migration rather than silently switching balances or moderators.
  IF TG_OP = 'UPDATE' AND OLD."committeeId" IS NOT NULL
    AND NEW."committeeId" IS DISTINCT FROM OLD."committeeId"
    THEN RAISE EXCEPTION 'Committee scope cannot be reassigned'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "ProposalArchive_committee_scope_guard" BEFORE INSERT OR UPDATE ON "ProposalArchive"
  FOR EACH ROW EXECUTE FUNCTION proposal_committee_scope_guard();

CREATE FUNCTION workspace_kind_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."kind" IS DISTINCT FROM OLD."kind" THEN RAISE EXCEPTION 'Workspace kind is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Community_kind_guard" BEFORE UPDATE ON "Community"
  FOR EACH ROW EXECUTE FUNCTION workspace_kind_guard();
COMMIT;
