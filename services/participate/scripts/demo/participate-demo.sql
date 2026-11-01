-- Committee demo database preparation. NEVER run against production.
-- Usage: psql "$DEMO_DATABASE_URL" -v ON_ERROR_STOP=1 -v host=<PARTICIPATE_COMMUNITY_ID> -f scripts/demo/participate-demo.sql
-- Refuses unless the connected database is named participate_demo or participate_demo_<suffix>.
-- Idempotent: re-running keeps tester rows and seat keys.
BEGIN;

DO $$
BEGIN
  IF current_database() !~ '^participate_demo(_[a-z0-9]{1,40})?$' THEN
    RAISE EXCEPTION 'participate-demo.sql only runs on a participate_demo database, not %', current_database();
  END IF;
END $$;

SELECT set_config('participate_demo.host', :'host', true);

DO $$
DECLARE committee TEXT; host TEXT := current_setting('participate_demo.host');
BEGIN
  SELECT min("committeeId") INTO committee FROM "ProposalArchive" WHERE "communityId" = host AND "committeeId" IS NOT NULL;
  IF committee IS NULL OR (SELECT count(DISTINCT "committeeId") FROM "ProposalArchive" WHERE "communityId" = host) <> 1 THEN
    RAISE EXCEPTION 'Host % must have exactly one committee', host;
  END IF;
  PERFORM set_config('participate_demo.committee', committee, true);
END $$;

CREATE TABLE IF NOT EXISTS "ParticipateDemoEnvironment" (
  "id" TEXT PRIMARY KEY, "databaseName" TEXT NOT NULL, "hostId" TEXT NOT NULL, "committeeId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')
);
-- Private keys of the four TEST seats only. They sign test ballots in this database and nowhere else.
CREATE TABLE IF NOT EXISTS "ParticipateDemoSeatKey" (
  "credentialId" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "rpId" TEXT NOT NULL, "privateKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'), UNIQUE ("userId", "rpId")
);
CREATE TABLE IF NOT EXISTS "ParticipateDemoTester" (
  "userId" TEXT PRIMARY KEY, "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'), "resetAt" TIMESTAMP(3)
);
-- Prisma stores timestamps as UTC wall time; keep demo timestamps comparable.
ALTER TABLE "ParticipateDemoTester" ALTER COLUMN "joinedAt" SET DEFAULT (now() AT TIME ZONE 'UTC');
CREATE TABLE IF NOT EXISTS "ParticipateDemoBaseline" (
  "archiveId" TEXT PRIMARY KEY, "labels" TEXT[] NOT NULL, "labelsVersion" INTEGER NOT NULL
);

-- Demo reset may delete a tester's rounds, ballots and their activity tail.
-- Updates stay blocked, and deletes need the transaction-local reset setting.
CREATE OR REPLACE FUNCTION participate_demo_reset_or_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('participate.demo_reset', true) = 'on'
     AND current_database() ~ '^participate_demo(_[a-z0-9]{1,40})?$'
     AND EXISTS (SELECT 1 FROM "ParticipateDemoEnvironment" WHERE "databaseName" = current_database()) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Records are append-only outside a demo reset';
END $$;
DROP TRIGGER IF EXISTS signed_round_immutable ON "SignedDecisionRound";
CREATE TRIGGER signed_round_immutable BEFORE UPDATE OR DELETE ON "SignedDecisionRound" FOR EACH ROW EXECUTE FUNCTION participate_demo_reset_or_immutable();
DROP TRIGGER IF EXISTS signed_voter_immutable ON "SignedDecisionVoter";
CREATE TRIGGER signed_voter_immutable BEFORE UPDATE OR DELETE ON "SignedDecisionVoter" FOR EACH ROW EXECUTE FUNCTION participate_demo_reset_or_immutable();
DROP TRIGGER IF EXISTS signed_ballot_immutable ON "SignedDecisionBallot";
CREATE TRIGGER signed_ballot_immutable BEFORE UPDATE OR DELETE ON "SignedDecisionBallot" FOR EACH ROW EXECUTE FUNCTION participate_demo_reset_or_immutable();
DROP TRIGGER IF EXISTS "ArchiveActivityEvent_immutable" ON "ArchiveActivityEvent";
CREATE TRIGGER "ArchiveActivityEvent_immutable" BEFORE UPDATE OR DELETE ON "ArchiveActivityEvent" FOR EACH ROW EXECUTE FUNCTION participate_demo_reset_or_immutable();

-- Four TEST seats. Reserved example.test addresses cannot receive sign-in codes.
INSERT INTO "User"("id", "nick", "displayName", "email", "emailVerifiedAt", "passwordHash", "role", "status")
SELECT 'demo_seat_' || n, 'demo-test-seat-' || n, 'Test seat ' || n, 'test-seat-' || n || '@example.test', (now() AT TIME ZONE 'UTC'), '!disabled', 'USER', 'ACTIVE'
FROM generate_series(2, 5) AS n
ON CONFLICT ("id") DO NOTHING;

-- Only the test seats and demo testers keep active committee seats.
UPDATE "CommunityMembership" SET "status" = 'DISABLED', "version" = "version" + 1, "updatedAt" = (now() AT TIME ZONE 'UTC')
WHERE "communityId" = current_setting('participate_demo.committee') AND "status" = 'ACTIVE'
  AND "userId" NOT LIKE 'demo\_seat\_%' AND "userId" NOT IN (SELECT "userId" FROM "ParticipateDemoTester");

INSERT INTO "CommunityMembership"("id", "communityId", "userId", "role", "status", "publicName", "updatedAt")
SELECT gen_random_uuid()::text, current_setting('participate_demo.committee'), 'demo_seat_' || n, 'REVIEWER', 'ACTIVE', 'Test seat ' || n, (now() AT TIME ZONE 'UTC')
FROM generate_series(2, 5) AS n
ON CONFLICT ("communityId", "userId") DO UPDATE SET "role" = 'REVIEWER', "status" = 'ACTIVE', "publicName" = EXCLUDED."publicName", "version" = "CommunityMembership"."version" + 1, "updatedAt" = (now() AT TIME ZONE 'UTC');

INSERT INTO "ParticipateDemoBaseline"("archiveId", "labels", "labelsVersion")
SELECT "id", "labels", "labelsVersion" FROM "ProposalArchive" WHERE "communityId" = current_setting('participate_demo.host')
ON CONFLICT ("archiveId") DO NOTHING;

INSERT INTO "ParticipateDemoEnvironment"("id", "databaseName", "hostId", "committeeId")
VALUES ('participate-committee-demo', current_database(), current_setting('participate_demo.host'), current_setting('participate_demo.committee'))
ON CONFLICT ("id") DO UPDATE SET "databaseName" = EXCLUDED."databaseName", "hostId" = EXCLUDED."hostId", "committeeId" = EXCLUDED."committeeId";

COMMIT;
