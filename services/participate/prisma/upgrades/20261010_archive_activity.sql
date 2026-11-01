-- Additive. Back up first. No payments, existing packages or anchors are changed.
BEGIN;
CREATE TABLE "ArchiveActivityActor" (
  "id" TEXT PRIMARY KEY,
  "archiveId" TEXT NOT NULL REFERENCES "ProposalArchive"("id") ON DELETE RESTRICT,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  UNIQUE ("archiveId", "userId")
);
CREATE TABLE "ArchiveActivityEvent" (
  "id" TEXT PRIMARY KEY,
  "archiveId" TEXT NOT NULL REFERENCES "ProposalArchive"("id") ON DELETE RESTRICT,
  "sequence" INTEGER NOT NULL CHECK ("sequence" > 0),
  "sourceKey" TEXT NOT NULL,
  "eventHash" TEXT NOT NULL UNIQUE CHECK ("eventHash" ~ '^[a-f0-9]{64}$'),
  "eventJson" TEXT NOT NULL CHECK (octet_length("eventJson") <= 16000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("archiveId", "sequence"), UNIQUE ("archiveId", "sourceKey"),
  CHECK (encode(sha256(convert_to("eventJson", 'UTF8')), 'hex') = "eventHash")
);
CREATE TABLE "ArchiveActivityBatch" (
  "id" TEXT PRIMARY KEY,
  "communityId" TEXT NOT NULL REFERENCES "Community"("id") ON DELETE RESTRICT,
  "network" "CreditPaymentNetwork" NOT NULL CHECK ("network" IN ('testnet', 'mainnet')),
  "root" TEXT NOT NULL CHECK ("root" ~ '^[a-f0-9]{64}$'),
  "leafCount" INTEGER NOT NULL CHECK ("leafCount" BETWEEN 1 AND 10000),
  "memo" TEXT NOT NULL,
  "receiver" TEXT NOT NULL,
  "txid" TEXT CHECK ("txid" ~ '^[a-f0-9]{64}$'),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("memo" = 'PARTICIPATE|ACTIVITY|v1|' || "network"::text || '|count:' || "leafCount"::text || '|sha256:' || "root")
);
CREATE INDEX "ArchiveActivityBatch_communityId_createdAt_idx" ON "ArchiveActivityBatch"("communityId", "createdAt");
CREATE TABLE "ArchiveActivityInclusion" (
  "eventId" TEXT PRIMARY KEY REFERENCES "ArchiveActivityEvent"("id") ON DELETE RESTRICT,
  "batchId" TEXT NOT NULL REFERENCES "ArchiveActivityBatch"("id") ON DELETE RESTRICT,
  "proof" JSONB NOT NULL
);
CREATE INDEX "ArchiveActivityInclusion_batchId_idx" ON "ArchiveActivityInclusion"("batchId");
CREATE TABLE "ArchiveActivityCheck" (
  "id" TEXT PRIMARY KEY,
  "batchId" TEXT NOT NULL REFERENCES "ArchiveActivityBatch"("id") ON DELETE RESTRICT,
  "status" TEXT NOT NULL CHECK ("status" IN ('VERIFIED', 'CONFIRMING', 'UNVERIFIED')),
  "evidence" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ArchiveActivityCheck_batchId_createdAt_idx" ON "ArchiveActivityCheck"("batchId", "createdAt");

CREATE TRIGGER "ArchiveActivityActor_immutable" BEFORE UPDATE OR DELETE ON "ArchiveActivityActor" FOR EACH ROW EXECUTE FUNCTION zvoice_archive_immutable();
CREATE TRIGGER "ArchiveActivityEvent_immutable" BEFORE UPDATE OR DELETE ON "ArchiveActivityEvent" FOR EACH ROW EXECUTE FUNCTION zvoice_archive_immutable();
CREATE TRIGGER "ArchiveActivityInclusion_immutable" BEFORE UPDATE OR DELETE ON "ArchiveActivityInclusion" FOR EACH ROW EXECUTE FUNCTION zvoice_archive_immutable();
CREATE TRIGGER "ArchiveActivityCheck_immutable" BEFORE UPDATE OR DELETE ON "ArchiveActivityCheck" FOR EACH ROW EXECUTE FUNCTION zvoice_archive_immutable();

CREATE FUNCTION archive_activity_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior "ArchiveActivityEvent"; archive "ProposalArchive"; payload JSONB;
BEGIN
  SELECT * INTO archive FROM "ProposalArchive" WHERE "id" = NEW."archiveId" FOR UPDATE;
  SELECT * INTO prior FROM "ArchiveActivityEvent" WHERE "archiveId" = NEW."archiveId" ORDER BY "sequence" DESC LIMIT 1;
  payload := NEW."eventJson"::jsonb;
  IF NEW."sequence" <> COALESCE(prior."sequence", 0) + 1
    OR payload->>'previousEventHash' IS DISTINCT FROM prior."eventHash"
    OR payload->>'id' IS DISTINCT FROM NEW."id"
    OR (payload->>'sequence')::integer IS DISTINCT FROM NEW."sequence"
    OR payload->>'recordId' IS DISTINCT FROM archive."recordId"
    OR payload->>'communityId' IS DISTINCT FROM archive."communityId"
    OR payload->>'schema' IS DISTINCT FROM 'PARTICIPATE_EVENT_V1'
    OR NOT EXISTS (SELECT 1 FROM "ArchiveActivityActor" a WHERE a."id" = payload->>'actor' AND a."archiveId" = NEW."archiveId")
    OR NOT EXISTS (SELECT 1 FROM "ArchiveRevision" r WHERE r."archiveId" = NEW."archiveId" AND r."manifestHash" = payload->>'proposalManifestHash') THEN
    RAISE EXCEPTION 'Invalid activity event chain';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "ArchiveActivityEvent_guard" BEFORE INSERT ON "ArchiveActivityEvent" FOR EACH ROW EXECUTE FUNCTION archive_activity_event_guard();

CREATE FUNCTION archive_activity_batch_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Activity batches must be retained'; END IF;
  IF (to_jsonb(NEW) - 'txid') IS DISTINCT FROM (to_jsonb(OLD) - 'txid') OR OLD."txid" IS NOT NULL OR NEW."txid" IS NULL THEN
    RAISE EXCEPTION 'Only the initial transaction binding is permitted';
  END IF;
  IF (SELECT count(*) FROM "ArchiveActivityInclusion" WHERE "batchId" = NEW."id") <> NEW."leafCount" THEN
    RAISE EXCEPTION 'Incomplete activity batch';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "ArchiveActivityBatch_guard" BEFORE UPDATE OR DELETE ON "ArchiveActivityBatch" FOR EACH ROW EXECUTE FUNCTION archive_activity_batch_guard();

CREATE FUNCTION archive_activity_inclusion_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE batch "ArchiveActivityBatch"; scope TEXT;
BEGIN
  SELECT * INTO batch FROM "ArchiveActivityBatch" WHERE "id" = NEW."batchId" FOR UPDATE;
  SELECT a."communityId" INTO scope FROM "ArchiveActivityEvent" e JOIN "ProposalArchive" a ON a."id" = e."archiveId" WHERE e."id" = NEW."eventId";
  IF batch."txid" IS NOT NULL OR scope IS DISTINCT FROM batch."communityId"
    OR NEW."proof"->>'root' IS DISTINCT FROM batch."root"
    OR (NEW."proof"->>'leafCount')::integer IS DISTINCT FROM batch."leafCount"
    OR (SELECT count(*) FROM "ArchiveActivityInclusion" WHERE "batchId" = batch."id") >= batch."leafCount" THEN
    RAISE EXCEPTION 'Invalid activity batch membership';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "ArchiveActivityInclusion_guard" BEFORE INSERT ON "ArchiveActivityInclusion" FOR EACH ROW EXECUTE FUNCTION archive_activity_inclusion_guard();
COMMIT;
