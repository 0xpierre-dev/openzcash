-- Additive account settings. Existing users keep their nick, credentials and
-- permissions; custom identity is private by default. No data is rewritten.
-- Apply once after the workspace schema. Fresh schemas created from Prisma
-- already include these columns; do not run this upgrade against those schemas.
BEGIN;
ALTER TABLE "User"
  ADD COLUMN "displayName" TEXT,
  ADD COLUMN "avatarUrl" TEXT,
  ADD COLUMN "shareProfileInDiscussion" BOOLEAN NOT NULL DEFAULT false;
COMMIT;
