-- Commit new enum values before using them in constraints.
ALTER TYPE "CommunityMembershipRole" ADD VALUE IF NOT EXISTS 'REVIEWER';
ALTER TYPE "CommunityMembershipRole" ADD VALUE IF NOT EXISTS 'MODERATOR';
BEGIN;
ALTER TABLE "CommunityMembership" ADD COLUMN "publicName" TEXT, ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
CREATE TABLE "CommitteePolicy" (
  "communityId" TEXT PRIMARY KEY REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "quorum" INTEGER NOT NULL CHECK ("quorum" BETWEEN 1 AND 200),
  "approvalPercent" INTEGER NOT NULL CHECK ("approvalPercent" BETWEEN 1 AND 100),
  "durationHours" INTEGER NOT NULL CHECK ("durationHours" BETWEEN 1 AND 720),
  "version" INTEGER NOT NULL DEFAULT 1, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "CommitteeInvitation" (
  "id" TEXT PRIMARY KEY, "communityId" TEXT NOT NULL REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "email" TEXT NOT NULL, "role" "CommunityMembershipRole" NOT NULL CHECK ("role" <> 'OWNER'),
  "invitedById" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "acceptedAt" TIMESTAMP(3),
  "acceptedById" TEXT, "revokedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "CommitteeInvitation_communityId_email_createdAt_idx" ON "CommitteeInvitation"("communityId", "email", "createdAt");
CREATE UNIQUE INDEX committee_pending_invitation ON "CommitteeInvitation"("communityId", "email") WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;
CREATE TABLE "CommitteeEvent" (
  "id" TEXT PRIMARY KEY, "communityId" TEXT NOT NULL REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "sequence" INTEGER NOT NULL, "actorId" TEXT NOT NULL, "action" TEXT NOT NULL, "details" JSONB NOT NULL,
  "previousHash" TEXT, "hash" TEXT NOT NULL UNIQUE, "createdAt" TIMESTAMP(3) NOT NULL,
  UNIQUE ("communityId", "sequence")
);
CREATE FUNCTION protect_committee_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Committee history is append-only'; END;
$$;
CREATE TRIGGER committee_event_immutable BEFORE UPDATE OR DELETE ON "CommitteeEvent" FOR EACH ROW EXECUTE FUNCTION protect_committee_event();
-- New roles are exclusive to committees. DAO authority retains its existing roles.
CREATE FUNCTION restrict_committee_roles() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."role" IN ('REVIEWER', 'MODERATOR') AND NOT EXISTS (SELECT 1 FROM "Community" WHERE "id" = NEW."communityId" AND "kind" = 'COMMITTEE') THEN
    RAISE EXCEPTION 'Reviewer and moderator roles require a committee';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER committee_role_scope BEFORE INSERT OR UPDATE ON "CommunityMembership" FOR EACH ROW EXECUTE FUNCTION restrict_committee_roles();
COMMIT;
