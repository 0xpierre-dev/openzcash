BEGIN;

-- CreateTable
CREATE TABLE "ProposalArchive" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalArchive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchiveRevision" (
    "id" TEXT NOT NULL,
    "archiveId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "manifestHash" TEXT NOT NULL,
    "packageJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArchiveRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchiveAnchor" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "network" "CreditPaymentNetwork" NOT NULL,
    "memo" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PREPARED',
    "operationId" TEXT,
    "txids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "receiver" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArchiveAnchor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchiveAnchorCheck" (
    "id" TEXT NOT NULL,
    "anchorId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArchiveAnchorCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchiveComment" (
    "id" TEXT NOT NULL,
    "archiveId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorLabel" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "parentId" TEXT,
    "requestKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hiddenAt" TIMESTAMP(3),
    "hiddenById" TEXT,
    "hiddenByLabel" TEXT,
    "hideReason" TEXT,

    CONSTRAINT "ArchiveComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchiveReaction" (
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "liked" BOOLEAN NOT NULL,

    CONSTRAINT "ArchiveReaction_pkey" PRIMARY KEY ("commentId","userId")
);

-- CreateTable
CREATE TABLE "ArchiveReactionRequest" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "liked" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArchiveReactionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProposalArchive_communityId_recordId_key" ON "ProposalArchive"("communityId", "recordId");

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveRevision_archiveId_revision_key" ON "ArchiveRevision"("archiveId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveRevision_archiveId_manifestHash_key" ON "ArchiveRevision"("archiveId", "manifestHash");

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveAnchor_revisionId_network_key" ON "ArchiveAnchor"("revisionId", "network");

-- CreateIndex
CREATE INDEX "ArchiveAnchorCheck_anchorId_createdAt_idx" ON "ArchiveAnchorCheck"("anchorId", "createdAt");

-- CreateIndex
CREATE INDEX "ArchiveComment_archiveId_createdAt_idx" ON "ArchiveComment"("archiveId", "createdAt");

-- CreateIndex
CREATE INDEX "ArchiveComment_authorId_createdAt_idx" ON "ArchiveComment"("authorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveComment_archiveId_authorId_requestKey_key" ON "ArchiveComment"("archiveId", "authorId", "requestKey");

-- CreateIndex
CREATE INDEX "ArchiveReactionRequest_userId_createdAt_idx" ON "ArchiveReactionRequest"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveReactionRequest_commentId_userId_requestKey_key" ON "ArchiveReactionRequest"("commentId", "userId", "requestKey");

-- AddForeignKey
ALTER TABLE "ProposalArchive" ADD CONSTRAINT "ProposalArchive_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchiveRevision" ADD CONSTRAINT "ArchiveRevision_archiveId_fkey" FOREIGN KEY ("archiveId") REFERENCES "ProposalArchive"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchiveAnchor" ADD CONSTRAINT "ArchiveAnchor_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ArchiveRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchiveAnchorCheck" ADD CONSTRAINT "ArchiveAnchorCheck_anchorId_fkey" FOREIGN KEY ("anchorId") REFERENCES "ArchiveAnchor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchiveComment" ADD CONSTRAINT "ArchiveComment_archiveId_fkey" FOREIGN KEY ("archiveId") REFERENCES "ProposalArchive"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchiveReaction" ADD CONSTRAINT "ArchiveReaction_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "ArchiveComment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchiveReactionRequest" ADD CONSTRAINT "ArchiveReactionRequest_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "ArchiveComment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ArchiveComment" ADD CONSTRAINT "ArchiveComment_author_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "ArchiveComment" ADD CONSTRAINT "ArchiveComment_moderator_fkey" FOREIGN KEY ("hiddenById") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "ArchiveReaction" ADD CONSTRAINT "ArchiveReaction_user_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "ArchiveReactionRequest" ADD CONSTRAINT "ArchiveReactionRequest_user_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "ArchiveComment" ADD CONSTRAINT "ArchiveComment_id_archive_unique" UNIQUE ("id", "archiveId");
ALTER TABLE "ArchiveComment" ADD CONSTRAINT "ArchiveComment_parent_scope" FOREIGN KEY ("parentId", "archiveId") REFERENCES "ArchiveComment"("id", "archiveId") ON DELETE RESTRICT;
ALTER TABLE "ArchiveComment" ADD CONSTRAINT "ArchiveComment_valid" CHECK (length("body") BETWEEN 1 AND 4000 AND ("parentId" IS NULL OR "parentId" <> "id") AND (("hiddenAt" IS NULL AND "hiddenById" IS NULL AND "hiddenByLabel" IS NULL AND "hideReason" IS NULL) OR ("hiddenAt" IS NOT NULL AND "hiddenById" IS NOT NULL AND "hiddenByLabel" IS NOT NULL AND length("hideReason") BETWEEN 1 AND 500)));
ALTER TABLE "ArchiveRevision" ADD CONSTRAINT "ArchiveRevision_valid" CHECK ("revision" > 0 AND "manifestHash" ~ '^[a-f0-9]{64}$' AND octet_length("packageJson") <= 8388608);
ALTER TABLE "ArchiveAnchor" ADD CONSTRAINT "ArchiveAnchor_valid" CHECK ("network" IN ('testnet', 'mainnet') AND octet_length("memo") <= 512 AND "state" IN ('PREPARED', 'SUBMITTING', 'SUBMITTED', 'UNKNOWN', 'FAILED', 'BROADCAST', 'UNBROADCAST'));
ALTER TABLE "ArchiveAnchorCheck" ADD CONSTRAINT "ArchiveAnchorCheck_valid" CHECK ("status" IN ('VERIFIED', 'CONFIRMING', 'UNVERIFIED'));

CREATE FUNCTION zvoice_archive_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Archive evidence is immutable'; END;
$$;
CREATE TRIGGER "ArchiveRevision_immutable" BEFORE UPDATE OR DELETE ON "ArchiveRevision" FOR EACH ROW EXECUTE FUNCTION zvoice_archive_immutable();
CREATE TRIGGER "ArchiveAnchorCheck_immutable" BEFORE UPDATE OR DELETE ON "ArchiveAnchorCheck" FOR EACH ROW EXECUTE FUNCTION zvoice_archive_immutable();
CREATE TRIGGER "ArchiveReactionRequest_immutable" BEFORE UPDATE OR DELETE ON "ArchiveReactionRequest" FOR EACH ROW EXECUTE FUNCTION zvoice_archive_immutable();

CREATE FUNCTION zvoice_archive_anchor_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Anchor intents must be retained'; END IF;
  IF (NEW."id", NEW."revisionId", NEW."network", NEW."memo", NEW."receiver", NEW."createdAt") IS DISTINCT FROM (OLD."id", OLD."revisionId", OLD."network", OLD."memo", OLD."receiver", OLD."createdAt") THEN RAISE EXCEPTION 'Anchor identity is immutable'; END IF;
  IF NOT ((OLD."state" = 'PREPARED' AND NEW."state" = 'SUBMITTING') OR (OLD."state" = 'SUBMITTING' AND NEW."state" IN ('SUBMITTED','UNKNOWN')) OR (OLD."state" = 'SUBMITTED' AND NEW."state" IN ('BROADCAST','UNBROADCAST','FAILED','UNKNOWN'))) THEN RAISE EXCEPTION 'Invalid anchor transition'; END IF;
  IF OLD."operationId" IS NOT NULL AND NEW."operationId" IS DISTINCT FROM OLD."operationId" THEN RAISE EXCEPTION 'Operation identity is immutable'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ArchiveAnchor_guard" BEFORE UPDATE OR DELETE ON "ArchiveAnchor" FOR EACH ROW EXECUTE FUNCTION zvoice_archive_anchor_guard();

CREATE FUNCTION zvoice_archive_comment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Comments must be retained'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."parentId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ArchiveComment" p WHERE p."id" = NEW."parentId" AND p."archiveId" = NEW."archiveId" AND p."parentId" IS NULL AND p."hiddenAt" IS NULL) THEN RAISE EXCEPTION 'Invalid reply'; END IF;
    RETURN NEW;
  END IF;
  IF (NEW."id", NEW."archiveId", NEW."authorId", NEW."authorLabel", NEW."body", NEW."parentId", NEW."requestKey", NEW."createdAt") IS DISTINCT FROM (OLD."id", OLD."archiveId", OLD."authorId", OLD."authorLabel", OLD."body", OLD."parentId", OLD."requestKey", OLD."createdAt") OR OLD."hiddenAt" IS NOT NULL OR NEW."hiddenAt" IS NULL THEN RAISE EXCEPTION 'Only initial moderation is permitted'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ArchiveComment_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ArchiveComment" FOR EACH ROW EXECUTE FUNCTION zvoice_archive_comment_guard();
COMMIT;
