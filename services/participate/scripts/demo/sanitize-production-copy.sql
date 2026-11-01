-- Turns a RESTORED COPY of the production backup into public-only demo data.
-- NEVER run against production. Run as a database superuser (bypasses the
-- append-only triggers for this session only), then run participate-demo.sql.
-- Usage: psql -d participate_demo_<x> -v ON_ERROR_STOP=1 -f scripts/demo/sanitize-production-copy.sql
BEGIN;

DO $$
BEGIN
  IF current_database() !~ '^participate_demo(_[a-z0-9]{1,40})?$' THEN
    RAISE EXCEPTION 'sanitize-production-copy.sql only runs on a participate_demo copy, not %', current_database();
  END IF;
END $$;

SET LOCAL session_replication_role = replica;

-- Sign-in material, private inboxes and rate-limit state.
DELETE FROM "Passkey";
DELETE FROM "PasskeyChallenge";
DELETE FROM "PasskeyThrottle";
DELETE FROM "EmailAuthChallenge";
DELETE FROM "EmailAuthThrottle";
DELETE FROM "FundingQuoteThrottle";
DELETE FROM "DiscussionNotification";
DELETE FROM "CommitteeInvitation";

-- Unpublished drafts belong to their authors only.
DELETE FROM "ProposalFundingQuote";
DELETE FROM "ProposalDraftDeletion";
DELETE FROM "ProposalSubmission" WHERE "state" = 'DRAFT';

-- Worker state: the demo runs no source worker or anchoring.
DELETE FROM "ParticipateAutomationLog";
DELETE FROM "ParticipateAutomationState";

-- Accounts keep only what discussions already show publicly (nick, display
-- name, avatar). No email, password or admin role survives the copy.
UPDATE "User" SET "email" = NULL, "emailVerifiedAt" = NULL, "passwordHash" = '!demo-copy', "role" = 'USER';

-- The real committee is never seated in the demo.
UPDATE "CommunityMembership" SET "status" = 'DISABLED'
WHERE "communityId" IN (SELECT "id" FROM "Community" WHERE "kind" = 'COMMITTEE');

COMMIT;

-- Verification: every count must be zero.
SELECT 'emails' AS check, count(*) FROM "User" WHERE "email" IS NOT NULL
UNION ALL SELECT 'passwords', count(*) FROM "User" WHERE "passwordHash" NOT IN ('', '!demo-copy')
UNION ALL SELECT 'admins', count(*) FROM "User" WHERE "role" = 'ADMIN'
UNION ALL SELECT 'passkeys', count(*) FROM "Passkey"
UNION ALL SELECT 'drafts', count(*) FROM "ProposalSubmission" WHERE "state" = 'DRAFT'
UNION ALL SELECT 'notifications', count(*) FROM "DiscussionNotification";
