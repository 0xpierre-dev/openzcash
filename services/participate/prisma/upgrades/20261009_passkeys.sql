-- Additive passkey storage. Apply once to existing databases; fresh Prisma
-- schemas already contain these tables. Passwords and sessions are unchanged.
BEGIN;
CREATE TABLE "Passkey" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "credentialId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "userHandle" TEXT NOT NULL,
  "rpId" TEXT NOT NULL,
  "publicKey" BYTEA NOT NULL,
  "counter" BIGINT NOT NULL DEFAULT 0,
  "transports" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "deviceType" TEXT NOT NULL,
  "backedUp" BOOLEAN NOT NULL,
  "label" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "Passkey_credentialId_key" ON "Passkey"("credentialId");
CREATE INDEX "Passkey_userId_rpId_revokedAt_idx" ON "Passkey"("userId", "rpId", "revokedAt");
CREATE TABLE "PasskeyChallenge" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "challenge" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "origin" TEXT NOT NULL,
  "rpId" TEXT NOT NULL,
  "userId" TEXT,
  "userHandle" TEXT,
  "passwordVersion" TEXT,
  "label" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "PasskeyChallenge_expiresAt_idx" ON "PasskeyChallenge"("expiresAt");
CREATE TABLE "PasskeyThrottle" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "resetsAt" TIMESTAMP(3) NOT NULL
);
COMMIT;
