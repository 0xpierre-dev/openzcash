-- Apply once, after backing up the database. No historical identities are linked.
BEGIN;
CREATE TYPE "DaoMembershipRequestStatus" AS ENUM ('PENDING', 'PROPOSED', 'ADMITTED', 'DECLINED', 'WITHDRAWN');
ALTER TABLE "DaoMember" ALTER COLUMN "signalUsername" DROP NOT NULL;
ALTER TABLE "DaoMember" ADD COLUMN "userId" TEXT REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "DaoMember_communityId_userId_key" ON "DaoMember"("communityId", "userId");
CREATE TABLE "DaoMembershipRequest" (
  "id" TEXT PRIMARY KEY,
  "communityId" TEXT NOT NULL REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "status" "DaoMembershipRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedById" TEXT REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "DaoMembershipRequest_communityId_status_createdAt_idx" ON "DaoMembershipRequest"("communityId", "status", "createdAt");
CREATE INDEX "DaoMembershipRequest_userId_createdAt_idx" ON "DaoMembershipRequest"("userId", "createdAt");
-- Serializable service transactions also enforce this for fresh Prisma databases.
CREATE UNIQUE INDEX "DaoMembershipRequest_one_open_attempt" ON "DaoMembershipRequest"("communityId", "userId") WHERE "status" IN ('PENDING', 'PROPOSED');
ALTER TABLE "DaoMembershipAction" ALTER COLUMN "signalUsername" DROP NOT NULL;
ALTER TABLE "DaoMembershipAction" ADD COLUMN "userId" TEXT REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DaoMembershipAction" ADD COLUMN "requestId" TEXT REFERENCES "DaoMembershipRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "DaoMembershipAction_requestId_key" ON "DaoMembershipAction"("requestId");
COMMIT;
