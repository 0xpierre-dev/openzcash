-- Additive operator-only demo allowances. No balance changes in this migration.
-- Run as a script, not within an outer transaction: PostgreSQL must commit the
-- enum value before the following transaction can use it.
ALTER TYPE "CreditOperationKind" ADD VALUE IF NOT EXISTS 'ADMIN_DEMO_GRANT';
BEGIN;
ALTER TABLE "CreditOperation" DROP CONSTRAINT "CreditOperation_shape_check";
ALTER TABLE "CreditOperation" ADD CONSTRAINT "CreditOperation_shape_check" CHECK (
  char_length("requestKey") BETWEEN 1 AND 128 AND "payloadHash" ~ '^[a-f0-9]{64}$' AND "policyVersion" > 0
  AND (("kind" = 'PREVIEW_GRANT' AND "delta" = 25 AND "targetId" IS NULL AND "requestKey" = 'preview-grant:v1' AND "purchaseId" IS NULL)
    OR ("kind" = 'ADMIN_DEMO_GRANT' AND "delta" BETWEEN 1 AND 1000 AND "purchaseId" IS NULL
      AND "requestKey" ~ '^demo-topup:[A-Za-z0-9][A-Za-z0-9:_-]{0,110}$'
      AND "targetId" IS NOT NULL AND char_length(trim("targetId")) BETWEEN 8 AND 128)
    OR ("kind" IN ('COMMENT', 'REACTION') AND "delta" BETWEEN -100 AND -1 AND "targetId" IS NOT NULL AND char_length("targetId") BETWEEN 1 AND 128 AND "purchaseId" IS NULL)
    OR ("kind" = 'PROPOSAL_SUBMISSION' AND "delta" = -20 AND "targetId" IS NOT NULL AND char_length("targetId") BETWEEN 1 AND 128 AND "purchaseId" IS NULL AND "policyVersion" = 1)
    OR ("kind" = 'PURCHASE' AND "delta" BETWEEN 1 AND 1000000 AND "purchaseId" IS NOT NULL AND "targetId" = "purchaseId"))
);
CREATE OR REPLACE FUNCTION credit_purchase_no_demo_mix() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE account_id TEXT;
BEGIN
  IF TG_TABLE_NAME = 'CreditPurchase' THEN
    account_id := NEW."creditAccountId";
    IF EXISTS (SELECT 1 FROM "CreditOperation" WHERE "accountId" = account_id AND "kind" IN ('PREVIEW_GRANT', 'ADMIN_DEMO_GRANT')) THEN
      RAISE EXCEPTION 'Demo credit accounts cannot receive real purchases';
    END IF;
  ELSIF NEW."kind" IN ('PREVIEW_GRANT', 'ADMIN_DEMO_GRANT') THEN
    IF EXISTS (SELECT 1 FROM "CreditPurchase" WHERE "creditAccountId" = NEW."accountId") THEN
      RAISE EXCEPTION 'Real purchase accounts cannot receive demo credits';
    END IF;
    IF NEW."kind" = 'ADMIN_DEMO_GRANT' AND (
      NOT EXISTS (SELECT 1 FROM "CreditOperation" WHERE "accountId" = NEW."accountId" AND "kind" = 'PREVIEW_GRANT')
      OR NOT EXISTS (SELECT 1 FROM "Community" WHERE id = NEW."communityId" AND kind = 'COMMITTEE')
    ) THEN RAISE EXCEPTION 'Demo top-ups require an existing committee demo allowance'; END IF;
  END IF;
  RETURN NEW;
END $$;
COMMIT;
