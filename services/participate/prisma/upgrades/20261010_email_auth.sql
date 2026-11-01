-- Additive. Existing account credentials and sessions are preserved.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3);
CREATE TABLE IF NOT EXISTS "EmailAuthChallenge" (
  "id" TEXT PRIMARY KEY, "email" TEXT NOT NULL, "purpose" TEXT NOT NULL,
  "userId" TEXT, "binding" TEXT NOT NULL, "origin" TEXT NOT NULL, "codeHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL, "deliveredAt" TIMESTAMP(3), "consumedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "EmailAuthChallenge_expiresAt_idx" ON "EmailAuthChallenge"("expiresAt");
CREATE TABLE IF NOT EXISTS "EmailAuthThrottle" (
  "id" TEXT PRIMARY KEY, "attempts" INTEGER NOT NULL, "resetsAt" TIMESTAMP(3) NOT NULL, "lastSentAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "EmailAuthThrottle_resetsAt_idx" ON "EmailAuthThrottle"("resetsAt");
