-- Additive purchase support after participation credits. Apply once after a verified backup.
-- Does not configure wallets, issue credits, submit transactions or migrate demo balances.
-- Enum addition must commit before constraints can reference the new enum value.
ALTER TYPE "CreditOperationKind" ADD VALUE IF NOT EXISTS 'PURCHASE';
BEGIN;
-- CreateEnum
CREATE TYPE "CreditPurchaseState" AS ENUM ('PENDING', 'CONFIRMING', 'CREDITED', 'EXPIRED', 'REVIEW');

-- CreateEnum
CREATE TYPE "CreditPaymentNetwork" AS ENUM ('mainnet', 'testnet', 'regtest');

-- CreateEnum
CREATE TYPE "CreditPaymentPool" AS ENUM ('sapling', 'orchard');

-- AlterTable
ALTER TABLE "CreditAccount" ADD COLUMN     "paymentReview" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CreditOperation" ADD COLUMN     "purchaseId" TEXT;

-- CreateTable
CREATE TABLE "CreditPurchase" (
    "id" TEXT NOT NULL,
    "creditAccountId" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "receiverAccountId" TEXT NOT NULL,
    "network" "CreditPaymentNetwork" NOT NULL,
    "address" TEXT NOT NULL,
    "amountZat" BIGINT NOT NULL,
    "credits" INTEGER NOT NULL,
    "requiredConfirmations" INTEGER NOT NULL,
    "memo" TEXT NOT NULL,
    "startHeight" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "CreditPurchaseState" NOT NULL DEFAULT 'PENDING',
    "txid" TEXT,
    "confirmations" INTEGER NOT NULL DEFAULT 0,
    "blockHeight" INTEGER,
    "blockHash" TEXT,
    "blockTime" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "checkLeaseKey" TEXT,
    "checkLeaseUntil" TIMESTAMP(3),
    "creditedAt" TIMESTAMP(3),
    "reviewReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditPaymentReceipt" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "network" "CreditPaymentNetwork" NOT NULL,
    "txid" TEXT NOT NULL,
    "pool" "CreditPaymentPool" NOT NULL,
    "outputIndex" INTEGER NOT NULL,
    "receiverAccountId" TEXT NOT NULL,
    "amountZat" BIGINT NOT NULL,
    "memo" TEXT NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "blockHash" TEXT NOT NULL,
    "blockTime" TIMESTAMP(3) NOT NULL,
    "confirmations" INTEGER NOT NULL,
    "tipHeight" INTEGER NOT NULL,
    "tipHash" TEXT NOT NULL,
    "scannedHeight" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditPaymentReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditPurchase_memo_key" ON "CreditPurchase"("memo");

-- CreateIndex
CREATE INDEX "CreditPurchase_creditAccountId_createdAt_idx" ON "CreditPurchase"("creditAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "CreditPurchase_userId_communityId_createdAt_idx" ON "CreditPurchase"("userId", "communityId", "createdAt");

-- CreateIndex
CREATE INDEX "CreditPurchase_status_lastCheckedAt_idx" ON "CreditPurchase"("status", "lastCheckedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreditPurchase_communityId_userId_requestKey_key" ON "CreditPurchase"("communityId", "userId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "CreditPurchase_id_creditAccountId_communityId_userId_key" ON "CreditPurchase"("id", "creditAccountId", "communityId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditPaymentReceipt_purchaseId_key" ON "CreditPaymentReceipt"("purchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditPaymentReceipt_network_txid_pool_outputIndex_key" ON "CreditPaymentReceipt"("network", "txid", "pool", "outputIndex");

-- CreateIndex
CREATE UNIQUE INDEX "CreditOperation_purchaseId_key" ON "CreditOperation"("purchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditOperation_purchaseId_accountId_communityId_userId_key" ON "CreditOperation"("purchaseId", "accountId", "communityId", "userId");

-- AddForeignKey
ALTER TABLE "CreditOperation" ADD CONSTRAINT "CreditOperation_purchaseId_accountId_communityId_userId_fkey" FOREIGN KEY ("purchaseId", "accountId", "communityId", "userId") REFERENCES "CreditPurchase"("id", "creditAccountId", "communityId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditPurchase" ADD CONSTRAINT "CreditPurchase_creditAccountId_communityId_userId_fkey" FOREIGN KEY ("creditAccountId", "communityId", "userId") REFERENCES "CreditAccount"("id", "communityId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditPurchase" ADD CONSTRAINT "CreditPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditPurchase" ADD CONSTRAINT "CreditPurchase_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditPaymentReceipt" ADD CONSTRAINT "CreditPaymentReceipt_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "CreditPurchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE UNIQUE INDEX "CreditPurchase_one_open_account" ON "CreditPurchase" ("creditAccountId") WHERE "status" IN ('PENDING', 'CONFIRMING');
ALTER TABLE "CreditPurchase" ADD CONSTRAINT "CreditPurchase_quote_check" CHECK (
  "amountZat" BETWEEN 1 AND 2100000000000000 AND "credits" BETWEEN 1 AND 1000000
  AND "requiredConfirmations" BETWEEN 1 AND 1000 AND ("network" <> 'mainnet' OR "requiredConfirmations" >= 6)
  AND "startHeight" >= 0 AND "confirmations" >= 0 AND "expiresAt" > "createdAt"
  AND char_length("requestKey") BETWEEN 16 AND 128 AND "requestKey" ~ '^[a-zA-Z0-9:_-]+$'
  AND char_length("memo") BETWEEN 16 AND 512 AND char_length("address") BETWEEN 40 AND 512
  AND ("txid" IS NULL OR "txid" ~ '^[a-f0-9]{64}$')
  AND (("checkLeaseKey" IS NULL AND "checkLeaseUntil" IS NULL) OR ("checkLeaseKey" IS NOT NULL AND "checkLeaseUntil" IS NOT NULL))
  AND ("status" <> 'CREDITED' OR "creditedAt" IS NOT NULL)
);
ALTER TABLE "CreditPaymentReceipt" ADD CONSTRAINT "CreditPaymentReceipt_evidence_check" CHECK (
  "txid" ~ '^[a-f0-9]{64}$' AND "blockHash" ~ '^[a-f0-9]{64}$' AND "tipHash" ~ '^[a-f0-9]{64}$'
  AND "amountZat" BETWEEN 1 AND 2100000000000000 AND "outputIndex" >= 0 AND "blockHeight" >= 0
  AND "confirmations" > 0 AND "tipHeight" >= "blockHeight" AND "scannedHeight" >= "tipHeight"
  AND "confirmations" = "tipHeight" - "blockHeight" + 1
);
ALTER TABLE "CreditOperation" DROP CONSTRAINT "CreditOperation_shape_check";
ALTER TABLE "CreditOperation" ADD CONSTRAINT "CreditOperation_shape_check" CHECK (
  char_length("requestKey") BETWEEN 1 AND 128 AND "payloadHash" ~ '^[a-f0-9]{64}$' AND "policyVersion" > 0
  AND (("kind" = 'PREVIEW_GRANT' AND "delta" = 25 AND "targetId" IS NULL AND "requestKey" = 'preview-grant:v1' AND "purchaseId" IS NULL)
    OR ("kind" IN ('COMMENT', 'REACTION') AND "delta" BETWEEN -100 AND -1 AND "targetId" IS NOT NULL AND char_length("targetId") BETWEEN 1 AND 128 AND "purchaseId" IS NULL)
    OR ("kind" = 'PURCHASE' AND "delta" BETWEEN 1 AND 1000000 AND "purchaseId" IS NOT NULL AND "targetId" = "purchaseId"))
);
CREATE TRIGGER "CreditPaymentReceipt_immutable" BEFORE UPDATE OR DELETE ON "CreditPaymentReceipt"
  FOR EACH ROW EXECUTE FUNCTION participation_credit_history_immutable();

CREATE FUNCTION credit_purchase_quote_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Credit purchase history cannot be deleted'; END IF;
  IF ROW(OLD."creditAccountId", OLD."communityId", OLD."userId", OLD."requestKey", OLD."receiverId", OLD."receiverAccountId", OLD."network", OLD."address", OLD."amountZat", OLD."credits", OLD."requiredConfirmations", OLD."memo", OLD."startHeight", OLD."expiresAt", OLD."createdAt")
    IS DISTINCT FROM ROW(NEW."creditAccountId", NEW."communityId", NEW."userId", NEW."requestKey", NEW."receiverId", NEW."receiverAccountId", NEW."network", NEW."address", NEW."amountZat", NEW."credits", NEW."requiredConfirmations", NEW."memo", NEW."startHeight", NEW."expiresAt", NEW."createdAt") THEN
    RAISE EXCEPTION 'Credit purchase quote is immutable';
  END IF;
  IF (OLD."creditedAt" IS NOT NULL AND OLD."creditedAt" IS DISTINCT FROM NEW."creditedAt")
    OR (OLD."status" = 'CREDITED' AND NEW."status" NOT IN ('CREDITED', 'REVIEW'))
    OR (OLD."status" = 'REVIEW' AND NEW."status" <> 'REVIEW') THEN
    RAISE EXCEPTION 'A credited or reviewed purchase cannot be reset';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "CreditPurchase_quote_immutable" BEFORE UPDATE OR DELETE ON "CreditPurchase"
  FOR EACH ROW EXECUTE FUNCTION credit_purchase_quote_immutable();

CREATE FUNCTION credit_purchase_no_demo_mix() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE account_id TEXT;
BEGIN
  IF TG_TABLE_NAME = 'CreditPurchase' THEN
    account_id := NEW."creditAccountId";
    IF EXISTS (SELECT 1 FROM "CreditOperation" WHERE "accountId" = account_id AND "kind" = 'PREVIEW_GRANT') THEN
      RAISE EXCEPTION 'Demo credit accounts cannot receive real purchases';
    END IF;
  ELSIF NEW."kind" = 'PREVIEW_GRANT' AND EXISTS (SELECT 1 FROM "CreditPurchase" WHERE "creditAccountId" = NEW."accountId") THEN
    RAISE EXCEPTION 'Real purchase accounts cannot receive demo credits';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "CreditPurchase_no_demo_mix" BEFORE INSERT ON "CreditPurchase" FOR EACH ROW EXECUTE FUNCTION credit_purchase_no_demo_mix();
CREATE TRIGGER "CreditOperation_no_demo_mix" BEFORE INSERT ON "CreditOperation" FOR EACH ROW EXECUTE FUNCTION credit_purchase_no_demo_mix();

CREATE FUNCTION credit_purchase_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE purchase_id TEXT; purchase_row "CreditPurchase"%ROWTYPE; receipt_row "CreditPaymentReceipt"%ROWTYPE; operation_row "CreditOperation"%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME = 'CreditPurchase' THEN purchase_id := NEW."id";
  ELSE purchase_id := NEW."purchaseId"; END IF;
  IF purchase_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO STRICT purchase_row FROM "CreditPurchase" WHERE "id" = purchase_id;
  SELECT * INTO receipt_row FROM "CreditPaymentReceipt" WHERE "purchaseId" = purchase_id;
  SELECT * INTO operation_row FROM "CreditOperation" WHERE "purchaseId" = purchase_id;
  IF purchase_row."creditedAt" IS NULL THEN
    IF receipt_row."id" IS NOT NULL OR operation_row."id" IS NOT NULL THEN RAISE EXCEPTION 'Purchase receipt and credits require a completed purchase'; END IF;
  ELSE
    IF purchase_row."status" NOT IN ('CREDITED', 'REVIEW') OR receipt_row."id" IS NULL OR operation_row."id" IS NULL
      OR receipt_row."network" <> purchase_row."network" OR receipt_row."receiverAccountId" <> purchase_row."receiverAccountId"
      OR receipt_row."amountZat" <> purchase_row."amountZat" OR receipt_row."memo" <> purchase_row."memo"
      OR receipt_row."confirmations" < purchase_row."requiredConfirmations" OR receipt_row."blockTime" > purchase_row."expiresAt"
      OR receipt_row."blockHeight" < purchase_row."startHeight"
      OR operation_row."kind" <> 'PURCHASE' OR operation_row."delta" <> purchase_row."credits" THEN
      RAISE EXCEPTION 'Purchase receipt and credit journal do not match the immutable quote';
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "CreditPurchase_complete" AFTER INSERT OR UPDATE ON "CreditPurchase" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION credit_purchase_complete();
CREATE CONSTRAINT TRIGGER "CreditPaymentReceipt_complete" AFTER INSERT ON "CreditPaymentReceipt" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION credit_purchase_complete();
CREATE CONSTRAINT TRIGGER "CreditOperation_purchase_complete" AFTER INSERT ON "CreditOperation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION credit_purchase_complete();
COMMIT;
