-- Upgrade the existing schema without deleting or automatically assigning legacy history.
-- Back up and restore-test the database, inspect this script, then run once during maintenance.
-- Do not use db push for an existing deployment: it cannot make the explicit legacy access decision.
-- NULL communityId records remain preserved and are excluded by community administration.
-- This is not a baselined Prisma migration; apply against the original schema only.

BEGIN;

CREATE TYPE "CommunityMembershipRole" AS ENUM ('OWNER', 'MANAGER');
CREATE TYPE "CommunityMembershipStatus" AS ENUM ('ACTIVE', 'DISABLED');

CREATE TABLE "Community" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Community_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommunityMembership" (
  "id" TEXT NOT NULL,
  "communityId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "CommunityMembershipRole" NOT NULL,
  "status" "CommunityMembershipStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommunityMembership_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Poll" ADD COLUMN "communityId" TEXT;
ALTER TABLE "DaoMember" ADD COLUMN "communityId" TEXT;

CREATE UNIQUE INDEX "Community_slug_key" ON "Community"("slug");
CREATE UNIQUE INDEX "CommunityMembership_communityId_userId_key" ON "CommunityMembership"("communityId", "userId");
CREATE INDEX "CommunityMembership_userId_status_idx" ON "CommunityMembership"("userId", "status");
CREATE INDEX "Poll_communityId_createdAt_idx" ON "Poll"("communityId", "createdAt");
CREATE UNIQUE INDEX "DaoMember_communityId_nick_key" ON "DaoMember"("communityId", "nick");
CREATE UNIQUE INDEX "DaoMember_communityId_signalUsername_key" ON "DaoMember"("communityId", "signalUsername");
CREATE INDEX "DaoMember_communityId_status_idx" ON "DaoMember"("communityId", "status");

-- Preserve uniqueness among unassigned legacy identities while permitting independent communities.
-- Prisma cannot express these partial legacy indexes; retain them during future schema changes.
CREATE UNIQUE INDEX "DaoMember_legacy_nick_key" ON "DaoMember"("nick") WHERE "communityId" IS NULL;
CREATE UNIQUE INDEX "DaoMember_legacy_signalUsername_key" ON "DaoMember"("signalUsername") WHERE "communityId" IS NULL;
DROP INDEX "DaoMember_nick_key";
DROP INDEX "DaoMember_signalUsername_key";

ALTER TABLE "Community" ADD CONSTRAINT "Community_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommunityMembership" ADD CONSTRAINT "CommunityMembership_communityId_fkey"
  FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommunityMembership" ADD CONSTRAINT "CommunityMembership_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_communityId_fkey"
  FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DaoMember" ADD CONSTRAINT "DaoMember_communityId_fkey"
  FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;

-- Verify before enabling administration:
-- SELECT count(*) FROM "Poll" WHERE "communityId" IS NULL;
-- SELECT count(*) FROM "DaoMember" WHERE "communityId" IS NULL;
-- Create explicit community ownership, then review and map each legacy group separately.
-- No community, membership, record mapping, or administrative access is granted by this script.
