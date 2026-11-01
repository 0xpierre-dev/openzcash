BEGIN;
ALTER TABLE "ProposalArchive"
  ADD COLUMN "labels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "labelsVersion" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "ProposalArchive_labels_bounds" CHECK (cardinality("labels") <= 100 AND "labelsVersion" >= 0);
COMMIT;
