BEGIN;
CREATE TABLE "ParticipateAutomationState" (
  "hostId" TEXT PRIMARY KEY, "committeeId" TEXT NOT NULL, "policyHash" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL, "cursorAt" TIMESTAMP(3) NOT NULL,
  "nextPollAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastRunAt" TIMESTAMP(3), "lastSuccessAt" TIMESTAMP(3), "lastErrorCode" TEXT,
  "failures" INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE "ParticipateAutomationJob" (
  "id" TEXT PRIMARY KEY, "hostId" TEXT NOT NULL, "committeeId" TEXT NOT NULL,
  "issueNumber" INTEGER NOT NULL CHECK ("issueNumber" > 0), "sourceUrl" TEXT NOT NULL,
  "manifestHash" TEXT NOT NULL CHECK ("manifestHash" ~ '^[a-f0-9]{64}$'), "packageJson" TEXT NOT NULL,
  "revisionId" TEXT REFERENCES "ArchiveRevision"("id") ON DELETE RESTRICT,
  "anchorId" TEXT REFERENCES "ArchiveAnchor"("id") ON DELETE RESTRICT,
  "state" TEXT NOT NULL DEFAULT 'CAPTURED' CHECK ("state" IN ('CAPTURED','PREPARED','DISPATCHED','CONFIRMING','VERIFIED','NEEDS_REVIEW')),
  "txid" TEXT CHECK ("txid" ~ '^[a-f0-9]{64}$'), "feeZat" INTEGER CHECK ("feeZat" > 0 AND "feeZat" <= 50000),
  "attempts" INTEGER NOT NULL DEFAULT 0, "lastErrorCode" TEXT,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "ParticipateAutomationJob_hostId_issueNumber_key" ON "ParticipateAutomationJob"("hostId","issueNumber");
CREATE INDEX "ParticipateAutomationJob_hostId_nextAttemptAt_idx" ON "ParticipateAutomationJob"("hostId","nextAttemptAt");
CREATE TABLE "ParticipateAutomationLog" (
  "id" TEXT PRIMARY KEY, "hostId" TEXT NOT NULL, "jobId" TEXT,
  "level" TEXT NOT NULL CHECK ("level" IN ('info','warn','error')), "event" TEXT NOT NULL,
  "code" TEXT, "details" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ParticipateAutomationLog_hostId_createdAt_idx" ON "ParticipateAutomationLog"("hostId","createdAt");
CREATE FUNCTION participate_automation_job_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Automation intents must be retained'; END IF;
  IF (NEW."id", NEW."hostId", NEW."committeeId", NEW."issueNumber", NEW."sourceUrl", NEW."manifestHash", NEW."packageJson", NEW."createdAt")
     IS DISTINCT FROM (OLD."id", OLD."hostId", OLD."committeeId", OLD."issueNumber", OLD."sourceUrl", OLD."manifestHash", OLD."packageJson", OLD."createdAt")
     THEN RAISE EXCEPTION 'Automation capture is immutable'; END IF;
  IF (OLD."txid" IS NOT NULL AND NEW."txid" IS DISTINCT FROM OLD."txid") OR
     (OLD."revisionId" IS NOT NULL AND NEW."revisionId" IS DISTINCT FROM OLD."revisionId") OR
     (OLD."anchorId" IS NOT NULL AND NEW."anchorId" IS DISTINCT FROM OLD."anchorId")
     THEN RAISE EXCEPTION 'Automation publication identity is immutable'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER participate_automation_job_immutable BEFORE UPDATE OR DELETE ON "ParticipateAutomationJob" FOR EACH ROW EXECUTE FUNCTION participate_automation_job_guard();
CREATE FUNCTION participate_automation_log_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Automation logs are append only'; END;
$$;
CREATE TRIGGER participate_automation_log_immutable BEFORE UPDATE OR DELETE ON "ParticipateAutomationLog" FOR EACH ROW EXECUTE FUNCTION participate_automation_log_guard();
COMMIT;
