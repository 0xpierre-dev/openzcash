BEGIN;
SET LOCAL lock_timeout = '10s';
ALTER TABLE "ParticipateAutomationJob" ADD COLUMN IF NOT EXISTS "revision" INTEGER;
ALTER TABLE "ParticipateAutomationJob" ADD COLUMN IF NOT EXISTS "sourceFingerprint" TEXT;
UPDATE "ParticipateAutomationJob"
SET "revision" = (("packageJson"::jsonb ->> 'manifest')::jsonb ->> 'revision')::integer
WHERE "revision" IS NULL;
ALTER TABLE "ParticipateAutomationJob" ALTER COLUMN "revision" SET DEFAULT 1;
ALTER TABLE "ParticipateAutomationJob" ALTER COLUMN "revision" SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'participate_source_revision_valid') THEN
    ALTER TABLE "ParticipateAutomationJob" ADD CONSTRAINT participate_source_revision_valid CHECK ("revision" BETWEEN 1 AND 10000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'participate_source_fingerprint_valid') THEN
    ALTER TABLE "ParticipateAutomationJob" ADD CONSTRAINT participate_source_fingerprint_valid CHECK ("sourceFingerprint" IS NULL OR "sourceFingerprint" ~ '^[a-f0-9]{64}$');
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "ParticipateAutomationJob_hostId_issueNumber_revision_key" ON "ParticipateAutomationJob"("hostId", "issueNumber", "revision");
DROP INDEX IF EXISTS "ParticipateAutomationJob_hostId_issueNumber_key";
CREATE OR REPLACE FUNCTION participate_automation_job_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Automation intents must be retained'; END IF;
  IF (NEW."id", NEW."hostId", NEW."committeeId", NEW."issueNumber", NEW."sourceUrl", NEW."revision", NEW."sourceFingerprint", NEW."manifestHash", NEW."packageJson", NEW."createdAt")
     IS DISTINCT FROM (OLD."id", OLD."hostId", OLD."committeeId", OLD."issueNumber", OLD."sourceUrl", OLD."revision", OLD."sourceFingerprint", OLD."manifestHash", OLD."packageJson", OLD."createdAt")
     THEN RAISE EXCEPTION 'Automation capture is immutable'; END IF;
  IF (OLD."txid" IS NOT NULL AND NEW."txid" IS DISTINCT FROM OLD."txid") OR
     (OLD."revisionId" IS NOT NULL AND NEW."revisionId" IS DISTINCT FROM OLD."revisionId") OR
     (OLD."anchorId" IS NOT NULL AND NEW."anchorId" IS DISTINCT FROM OLD."anchorId")
     THEN RAISE EXCEPTION 'Automation publication identity is immutable'; END IF;
  RETURN NEW;
END;
$$;
CREATE TABLE IF NOT EXISTS "ParticipateSourceCheckpoint" (
  "hostId" TEXT NOT NULL, "issueNumber" INTEGER NOT NULL CHECK ("issueNumber" > 0),
  "recordId" TEXT NOT NULL, "sourceUpdatedAt" TIMESTAMP(3) NOT NULL, "checkedAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("hostId", "issueNumber")
);
CREATE INDEX IF NOT EXISTS "ParticipateSourceCheckpoint_hostId_checkedAt_idx" ON "ParticipateSourceCheckpoint"("hostId", "checkedAt");
CREATE OR REPLACE FUNCTION participate_source_checkpoint_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Source checkpoints must be retained'; END IF;
  IF (NEW."hostId", NEW."issueNumber", NEW."recordId") IS DISTINCT FROM (OLD."hostId", OLD."issueNumber", OLD."recordId")
    THEN RAISE EXCEPTION 'Source checkpoint identity is immutable'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS participate_source_checkpoint_immutable ON "ParticipateSourceCheckpoint";
CREATE TRIGGER participate_source_checkpoint_immutable BEFORE UPDATE OR DELETE ON "ParticipateSourceCheckpoint" FOR EACH ROW EXECUTE FUNCTION participate_source_checkpoint_guard();
-- Preserve the existing separation between the application and backup reader.
DO $$ DECLARE permission RECORD;
BEGIN
  FOR permission IN SELECT grantee, privilege_type FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'ParticipateAutomationState'
      AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE') AND grantee <> 'PUBLIC'
  LOOP
    EXECUTE format('GRANT %s ON TABLE "ParticipateSourceCheckpoint" TO %I', permission.privilege_type, permission.grantee);
  END LOOP;
END $$;
COMMIT;
